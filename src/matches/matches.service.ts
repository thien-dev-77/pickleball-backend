import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import type { DeepPartial, FindOptionsWhere } from 'typeorm';
import {
  Tournament,
  TournamentGroup,
  TournamentMatch,
} from '../database/entities';
import { matchRelations } from '../database/relations';
import { matchResponse, paginate } from '../common/serializers';
import { businessValidation } from '../common/validation';
import {
  GenerateRoundRobinDto,
  MatchQueryDto,
  MatchResultDto,
  UpdateMatchDto,
} from './matches.dto';

@Injectable()
export class MatchesService {
  constructor(private readonly db: DataSource) {}

  async index(query: MatchQueryDto) {
    const where: FindOptionsWhere<TournamentMatch> = {
      ...(query.tournament_id ? { tournamentId: query.tournament_id } : {}),
      ...(query.stage ? { stage: query.stage } : {}),
    };
    const perPage = 50;
    const [matches, total] = await this.db
      .getRepository(TournamentMatch)
      .findAndCount({
        where,
        relations: matchRelations,
        order: { scheduledAt: { direction: 'ASC', nulls: 'LAST' } },
        skip: (query.page - 1) * perPage,
        take: perPage,
      });
    return paginate(matches.map(matchResponse), total, query.page, perPage);
  }

  async show(id: string) {
    return matchResponse(
      await this.db
        .getRepository(TournamentMatch)
        .findOneOrFail({ where: { id }, relations: matchRelations }),
    );
  }

  async update(id: string, dto: UpdateMatchDto) {
    const repo = this.db.getRepository(TournamentMatch);
    const match = await repo.findOneByOrFail({ id });
    await repo.save(
      repo.merge(match, {
        ...(dto.round !== undefined ? { round: dto.round } : {}),
        ...(dto.court !== undefined ? { court: dto.court } : {}),
        ...(dto.scheduled_at !== undefined
          ? {
              scheduledAt: dto.scheduled_at ? new Date(dto.scheduled_at) : null,
            }
          : {}),
      }),
    );
    return this.show(id);
  }

  async result(id: string, dto: MatchResultDto) {
    if (dto.score_a === dto.score_b)
      businessValidation('score_b', 'Kết quả trận đấu không được hòa.');
    const current = await this.db
      .getRepository(TournamentMatch)
      .findOneByOrFail({ id });
    if (!current.teamAId || !current.teamBId)
      businessValidation(
        'score_a',
        'Trận đấu chưa đủ hai đội để nhập kết quả.',
      );
    const winnerTeamId =
      dto.score_a > dto.score_b ? current.teamAId : current.teamBId;
    await this.db.transaction(async (manager) => {
      if (current.stage === 'group') {
        await manager.delete(TournamentMatch, {
          tournamentId: current.tournamentId,
          stage: In(['semifinal', 'final']),
        });
        await manager.update(Tournament, current.tournamentId, {
          status: 'group',
        });
      }
      await manager.update(TournamentMatch, id, {
        scoreA: dto.score_a,
        scoreB: dto.score_b,
        winnerTeamId,
      });
      if (current.stage === 'semifinal') {
        const final = await manager.findOneBy(TournamentMatch, {
          tournamentId: current.tournamentId,
          stage: 'final',
        });
        if (final)
          await manager.update(TournamentMatch, final.id, {
            ...(current.round === 'Bán kết 1'
              ? { teamAId: winnerTeamId }
              : { teamBId: winnerTeamId }),
            scoreA: null,
            scoreB: null,
            winnerTeamId: null,
          });
      }
      if (current.stage === 'final')
        await manager.update(Tournament, current.tournamentId, {
          status: 'completed',
        });
    });
    return this.show(id);
  }

  async generateRoundRobin(groupId: string, dto: GenerateRoundRobinDto) {
    const group = await this.db.getRepository(TournamentGroup).findOneOrFail({
      where: { id: groupId },
      relations: { teams: true },
      order: { teams: { position: 'ASC' } },
    });
    const teamIds: (string | null)[] = group.teams.map(
      (membership) => membership.teamId,
    );
    if (teamIds.length < 2)
      businessValidation(
        'group',
        'Bảng đấu cần ít nhất 2 đội để tạo lịch vòng tròn.',
      );
    if (teamIds.length % 2 !== 0) teamIds.push(null);
    const startsAt = dto.starts_at ? new Date(dto.starts_at) : null;
    const courtCount = dto.court_count ?? 2;
    const interval = dto.round_interval_minutes ?? 45;
    const matchesPerRound = Math.floor(teamIds.length / 2);
    const slotsPerRound = Math.ceil(matchesPerRound / courtCount);
    const rows: DeepPartial<TournamentMatch>[] = [];
    const rotation = [...teamIds];
    for (let round = 0; round < teamIds.length - 1; round++) {
      for (let pair = 0; pair < matchesPerRound; pair++) {
        const teamAId = rotation[pair],
          teamBId = rotation[rotation.length - 1 - pair];
        if (!teamAId || !teamBId) continue;
        rows.push({
          tournamentId: group.tournamentId,
          groupId,
          stage: 'group',
          round: `Lượt ${round + 1}`,
          court: `Sân ${(pair % courtCount) + 1}`,
          teamAId,
          teamBId,
          scheduledAt: startsAt
            ? new Date(
                startsAt.getTime() +
                  (round * slotsPerRound + Math.floor(pair / courtCount)) *
                    interval *
                    60000,
              )
            : null,
        });
      }
      const fixed = rotation.shift()!,
        last = rotation.pop()!;
      rotation.unshift(last);
      rotation.unshift(fixed);
    }
    const ids = await this.db.transaction(async (manager) => {
      await manager.delete(TournamentMatch, {
        tournamentId: group.tournamentId,
        stage: In(['semifinal', 'final']),
      });
      await manager.delete(TournamentMatch, { groupId });
      const repo = manager.getRepository(TournamentMatch);
      const created = await repo.save(rows.map((row) => repo.create(row)));
      await manager.update(Tournament, group.tournamentId, { status: 'group' });
      return created.map((match) => match.id);
    });
    return (
      await this.db.getRepository(TournamentMatch).find({
        where: { id: In(ids) },
        relations: matchRelations,
        order: {
          scheduledAt: { direction: 'ASC', nulls: 'LAST' },
          createdAt: 'ASC',
        },
      })
    ).map(matchResponse);
  }
}
