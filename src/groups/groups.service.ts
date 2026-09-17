import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
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
import { CompetitionService } from '../competition/competition.service';
import {
  CreateGroupDto,
  RandomizeGroupsDto,
  UpdateGroupDto,
} from './groups.dto';

@Injectable()
export class GroupsService {
  constructor(
    private readonly db: DataSource,
    private readonly competition: CompetitionService,
  ) {}
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
  private async editable(
    manager: EntityManager,
    id: string,
    teamIds: string[],
    groupId?: string,
  ) {
    if (await manager.countBy(TournamentMatch, { tournamentId: id }))
      businessValidation('groups', 'Đã có lịch đấu, không được đổi bảng.');
    if (new Set(teamIds).size !== teamIds.length)
      businessValidation('team_ids', 'Danh sách đội không được trùng lặp.');
    if (teamIds.length) {
      if (
        (await manager.count(Team, {
          where: { tournamentId: id, id: In(teamIds) },
        })) !== teamIds.length
      )
        businessValidation('team_ids', 'Đội không thuộc giải.');
      const assignments = await manager.findBy(GroupTeam, {
        teamId: In(teamIds),
      });
      if (assignments.some((a) => a.groupId !== groupId))
        businessValidation('team_ids', 'Một suất chỉ được nằm trong một bảng.');
    }
  }
  async create(tournamentId: string, dto: CreateGroupDto) {
    const id = await this.competition.mutate(
      tournamentId,
      async (manager, tournament) => {
        if (!tournament.settings?.roster_locked)
          businessValidation('roster', 'Chốt danh sách trước khi tạo bảng.');
        await this.editable(manager, tournamentId, dto.team_ids);
        const group = await manager.save(
          TournamentGroup,
          manager.create(TournamentGroup, {
            tournamentId,
            name: dto.name,
            sortOrder:
              (await manager.countBy(TournamentGroup, { tournamentId })) + 1,
          }),
        );
        for (const [i, teamId] of dto.team_ids.entries())
          await manager.save(
            GroupTeam,
            manager.create(GroupTeam, {
              groupId: group.id,
              teamId,
              position: i + 1,
            }),
          );
        return group.id;
      },
    );
    return this.show(id);
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
    await this.competition.mutate(current.tournamentId, async (manager) => {
      await this.editable(
        manager,
        current.tournamentId,
        dto.team_ids ?? [],
        id,
      );
      if (dto.team_ids) {
        await manager.delete(GroupTeam, { groupId: id });
        for (const [i, teamId] of dto.team_ids.entries())
          await manager.save(
            GroupTeam,
            manager.create(GroupTeam, { groupId: id, teamId, position: i + 1 }),
          );
      }
      if (dto.name !== undefined)
        await manager.update(TournamentGroup, id, { name: dto.name });
    });
    return this.show(id);
  }
  async remove(id: string) {
    const current = await this.db
      .getRepository(TournamentGroup)
      .findOneByOrFail({ id });
    await this.competition.mutate(current.tournamentId, async (manager) => {
      await this.editable(manager, current.tournamentId, []);
      await manager.delete(TournamentGroup, id);
    });
  }
  async randomize(tournamentId: string, dto: RandomizeGroupsDto) {
    await this.competition.draw(tournamentId, dto);
    return this.index(tournamentId);
  }
}
