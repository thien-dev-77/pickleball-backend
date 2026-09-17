import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import {
  Team,
  Tournament,
  TournamentGroup,
  TournamentMatch,
} from '../database/entities';
import { matchRelations } from '../database/relations';
import { matchResponse } from '../common/serializers';
import { businessValidation } from '../common/validation';

type RankedTeam = {
  team: Team;
  wins: number;
  pointDifference: number;
  pointsFor: number;
};

@Injectable()
export class BracketsService {
  constructor(private readonly db: DataSource) {}

  async index(tournamentId: string) {
    await this.db
      .getRepository(Tournament)
      .findOneByOrFail({ id: tournamentId });
    const matches = await this.db.getRepository(TournamentMatch).find({
      where: { tournamentId, stage: In(['semifinal', 'final']) },
      relations: matchRelations,
    });
    matches.sort(
      (left, right) =>
        (left.stage === 'semifinal' ? 1 : 2) -
          (right.stage === 'semifinal' ? 1 : 2) ||
        left.round.localeCompare(right.round),
    );
    return matches.map(matchResponse);
  }

  async generate(tournamentId: string) {
    await this.db
      .getRepository(Tournament)
      .findOneByOrFail({ id: tournamentId });
    const groupMatches = await this.db
      .getRepository(TournamentMatch)
      .findBy({ tournamentId, stage: 'group' });
    if (
      !groupMatches.length ||
      groupMatches.some((match) => !match.winnerTeamId)
    )
      businessValidation(
        'matches',
        'Cần nhập đủ kết quả vòng bảng trước khi tạo nhánh đấu.',
      );
    const groups = await this.db.getRepository(TournamentGroup).find({
      where: { tournamentId },
      relations: { teams: { team: true } },
      order: { sortOrder: 'ASC' },
    });
    const rankings = groups.map((group) =>
      group.teams
        .map(({ team }) =>
          this.rank(
            team,
            groupMatches.filter((match) => match.groupId === group.id),
          ),
        )
        .sort(this.compare),
    );
    const semifinalists =
      rankings.length === 2 && rankings.every((ranking) => ranking.length >= 2)
        ? [rankings[0][0], rankings[1][1], rankings[1][0], rankings[0][1]]
        : rankings.flat().sort(this.compare).slice(0, 4);
    if (semifinalists.length < 4)
      businessValidation(
        'teams',
        'Cần ít nhất 4 đội có xếp hạng vòng bảng để tạo bán kết.',
      );
    const ids = await this.db.transaction(async (manager) => {
      await manager.delete(TournamentMatch, {
        tournamentId,
        stage: In(['semifinal', 'final']),
      });
      const repo = manager.getRepository(TournamentMatch);
      const matches = await repo.save([
        repo.create({
          tournamentId,
          stage: 'semifinal',
          round: 'Bán kết 1',
          court: 'Sân 1',
          teamAId: semifinalists[0].team.id,
          teamBId: semifinalists[1].team.id,
        }),
        repo.create({
          tournamentId,
          stage: 'semifinal',
          round: 'Bán kết 2',
          court: 'Sân 2',
          teamAId: semifinalists[2].team.id,
          teamBId: semifinalists[3].team.id,
        }),
        repo.create({
          tournamentId,
          stage: 'final',
          round: 'Chung kết',
          court: 'Sân 1',
        }),
      ]);
      await manager.update(Tournament, tournamentId, { status: 'knockout' });
      return matches.map((match) => match.id);
    });
    const matches = await this.db
      .getRepository(TournamentMatch)
      .find({ where: { id: In(ids) }, relations: matchRelations });
    matches.sort((left, right) => ids.indexOf(left.id) - ids.indexOf(right.id));
    return matches.map(matchResponse);
  }

  private rank(team: Team, matches: TournamentMatch[]): RankedTeam {
    let pointsFor = 0,
      pointsAgainst = 0,
      wins = 0;
    for (const match of matches.filter(
      (match) => match.teamAId === team.id || match.teamBId === team.id,
    )) {
      pointsFor +=
        (match.teamAId === team.id ? match.scoreA : match.scoreB) ?? 0;
      pointsAgainst +=
        (match.teamAId === team.id ? match.scoreB : match.scoreA) ?? 0;
      if (match.winnerTeamId === team.id) wins++;
    }
    return {
      team,
      wins,
      pointDifference: pointsFor - pointsAgainst,
      pointsFor,
    };
  }

  private compare(this: void, left: RankedTeam, right: RankedTeam) {
    return (
      right.wins - left.wins ||
      right.pointDifference - left.pointDifference ||
      right.pointsFor - left.pointsFor
    );
  }
}
