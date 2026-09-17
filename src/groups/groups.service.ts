import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import {
  GroupTeam,
  Team,
  Tournament,
  TournamentGroup,
  TournamentMatch,
} from '../database/entities';
import { groupRelations, matchRelations } from '../database/relations';
import { groupResponse } from '../common/serializers';
import { businessValidation } from '../common/validation';
import {
  CreateGroupDto,
  RandomizeGroupsDto,
  UpdateGroupDto,
} from './groups.dto';

@Injectable()
export class GroupsService {
  constructor(private readonly db: DataSource) {}

  async index(tournamentId: string) {
    await this.db
      .getRepository(Tournament)
      .findOneByOrFail({ id: tournamentId });
    return (
      await this.db.getRepository(TournamentGroup).find({
        where: { tournamentId },
        relations: groupRelations,
        order: { sortOrder: 'ASC', teams: { position: 'ASC' } },
      })
    ).map(groupResponse);
  }

  async create(tournamentId: string, dto: CreateGroupDto) {
    const teamIds = dto.team_ids ?? [];
    await this.assertTeams(tournamentId, teamIds);
    const id = await this.db.transaction(async (manager) => {
      const repo = manager.getRepository(TournamentGroup);
      const group = await repo.save(
        repo.create({
          tournamentId,
          name: dto.name,
          sortOrder: (await repo.countBy({ tournamentId })) + 1,
        }),
      );
      const memberships = manager.getRepository(GroupTeam);
      if (teamIds.length)
        await memberships.save(
          teamIds.map((teamId, index) =>
            memberships.create({
              groupId: group.id,
              teamId,
              position: index + 1,
            }),
          ),
        );
      return group.id;
    });
    return groupResponse(
      await this.db.getRepository(TournamentGroup).findOneOrFail({
        where: { id },
        relations: groupRelations,
        order: { teams: { position: 'ASC' } },
      }),
    );
  }

  async show(id: string) {
    return groupResponse(
      await this.db.getRepository(TournamentGroup).findOneOrFail({
        where: { id },
        relations: { ...groupRelations, matches: matchRelations },
        order: {
          teams: { position: 'ASC' },
          matches: { scheduledAt: { direction: 'ASC', nulls: 'LAST' } },
        },
      }),
    );
  }

  async update(id: string, dto: UpdateGroupDto) {
    const current = await this.db
      .getRepository(TournamentGroup)
      .findOneByOrFail({ id });
    if (dto.team_ids)
      await this.assertTeams(current.tournamentId, dto.team_ids);
    await this.db.transaction(async (manager) => {
      if (dto.team_ids) {
        await manager.delete(GroupTeam, { groupId: id });
        const repo = manager.getRepository(GroupTeam);
        if (dto.team_ids.length)
          await repo.save(
            dto.team_ids.map((teamId, index) =>
              repo.create({ groupId: id, teamId, position: index + 1 }),
            ),
          );
      }
      if (dto.name !== undefined)
        await manager.update(TournamentGroup, id, { name: dto.name });
    });
    return groupResponse(
      await this.db.getRepository(TournamentGroup).findOneOrFail({
        where: { id },
        relations: groupRelations,
        order: { teams: { position: 'ASC' } },
      }),
    );
  }

  async remove(id: string) {
    const repo = this.db.getRepository(TournamentGroup);
    await repo.delete((await repo.findOneByOrFail({ id })).id);
  }

  async randomize(tournamentId: string, dto: RandomizeGroupsDto) {
    await this.db
      .getRepository(Tournament)
      .findOneByOrFail({ id: tournamentId });
    const teams = await this.db.getRepository(Team).findBy({ tournamentId });
    if (teams.length < 2 || dto.group_count > teams.length)
      businessValidation(
        'group_count',
        'Số bảng không được lớn hơn số đội và giải cần ít nhất 2 đội.',
      );
    const shuffled = this.shuffle(teams);
    await this.db.transaction(async (manager) => {
      await manager.delete(TournamentMatch, { tournamentId });
      await manager.delete(TournamentGroup, { tournamentId });
      const repo = manager.getRepository(TournamentGroup);
      const groups = await repo.save(
        Array.from({ length: dto.group_count }, (_, index) =>
          repo.create({
            tournamentId,
            name: `Bảng ${this.groupLabel(index + 1)}`,
            sortOrder: index + 1,
          }),
        ),
      );
      const memberships = manager.getRepository(GroupTeam);
      await memberships.save(
        shuffled.map((team, index) =>
          memberships.create({
            groupId: groups[index % groups.length].id,
            teamId: team.id,
            position: Math.floor(index / groups.length) + 1,
          }),
        ),
      );
      await manager.update(Tournament, tournamentId, { status: 'group' });
    });
    return this.index(tournamentId);
  }

  private async assertTeams(tournamentId: string, teamIds: string[]) {
    await this.db
      .getRepository(Tournament)
      .findOneByOrFail({ id: tournamentId });
    if (new Set(teamIds).size !== teamIds.length)
      businessValidation('team_ids', 'Danh sách đội không được trùng lặp.');
    const count = await this.db
      .getRepository(Team)
      .countBy({ tournamentId, id: In(teamIds) });
    if (count !== teamIds.length)
      businessValidation(
        'team_ids',
        'Một hoặc nhiều đội không thuộc giải đấu này.',
      );
  }

  private shuffle<T>(items: T[]) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const target = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
    }
    return shuffled;
  }

  private groupLabel(number: number) {
    let label = '';
    while (number > 0) {
      number--;
      label = String.fromCharCode(65 + (number % 26)) + label;
      number = Math.floor(number / 26);
    }
    return label;
  }
}
