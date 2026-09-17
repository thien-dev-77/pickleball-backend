import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Team, Tournament } from '../database/entities';
import { teamRelations } from '../database/relations';
import { businessValidation } from '../common/validation';
import { teamResponse } from '../common/serializers';
import { CreateTeamDto, GenerateTeamsDto, UpdateTeamDto } from './teams.dto';
import { CompetitionService } from '../competition/competition.service';

@Injectable()
export class TeamsService {
  constructor(
    private readonly db: DataSource,
    private readonly competition: CompetitionService,
  ) {}
  async index(tournamentId: string) {
    await this.db
      .getRepository(Tournament)
      .findOneByOrFail({ id: tournamentId });
    return (
      await this.db.getRepository(Team).find({
        where: { tournamentId },
        relations: teamRelations,
        order: { seed: { direction: 'ASC', nulls: 'LAST' } },
      })
    ).map(teamResponse);
  }
  async create(tournamentId: string, dto: CreateTeamDto) {
    const id = await this.competition.mutate(
      tournamentId,
      async (manager, tournament) => {
        await this.competition.editableEntries(manager, tournamentId);
        if (
          (await manager.countBy(Team, { tournamentId })) >= tournament.maxTeams
        )
          businessValidation('teams', 'Vượt số suất thi đấu tối đa.');
        const players = await this.competition.assertEntryPlayers(
          manager,
          tournament,
          [dto.player_one_id, dto.player_two_id].filter(
            (id): id is string => !!id,
          ),
        );
        const team = await manager.save(
          Team,
          manager.create(Team, {
            tournamentId,
            name: dto.name || players.map((p) => p.name).join(' / '),
            playerOneId: players[0].id,
            playerTwoId: players[1]?.id ?? null,
            totalRating: players.reduce((sum, p) => sum + p.rating, 0),
            seed: dto.seed ?? null,
          }),
        );
        return team.id;
      },
    );
    return this.show(id);
  }
  async show(id: string) {
    return teamResponse(
      await this.db
        .getRepository(Team)
        .findOneOrFail({ where: { id }, relations: teamRelations }),
    );
  }
  async update(id: string, dto: UpdateTeamDto) {
    const current = await this.db.getRepository(Team).findOneByOrFail({ id });
    await this.competition.mutate(
      current.tournamentId,
      async (manager, tournament) => {
        await this.competition.editableEntries(manager, current.tournamentId);
        const team = await manager.findOneByOrFail(Team, { id });
        const ids = [
          dto.player_one_id ?? team.playerOneId,
          dto.player_two_id !== undefined
            ? dto.player_two_id
            : team.playerTwoId,
        ].filter((id): id is string => !!id);
        const players = await this.competition.assertEntryPlayers(
          manager,
          tournament,
          ids,
          id,
        );
        await manager.update(Team, id, {
          name: dto.name ?? players.map((p) => p.name).join(' / '),
          seed: dto.seed !== undefined ? dto.seed : team.seed,
          playerOneId: players[0].id,
          playerTwoId: players[1]?.id ?? null,
          totalRating: players.reduce((sum, p) => sum + p.rating, 0),
        });
      },
    );
    return this.show(id);
  }
  async remove(id: string) {
    const team = await this.db.getRepository(Team).findOneByOrFail({ id });
    await this.competition.mutate(team.tournamentId, async (manager) => {
      await this.competition.editableEntries(manager, team.tournamentId);
      await manager.delete(Team, id);
    });
  }
  async generate(tournamentId: string, dto: GenerateTeamsDto) {
    await this.competition.entries(tournamentId, dto);
    return this.index(tournamentId);
  }
}
