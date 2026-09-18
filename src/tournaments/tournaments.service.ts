import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { DeepPartial } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { businessValidation } from '../common/validation';
import { CompetitionService } from '../competition/competition.service';
import {
  Team,
  Tournament,
  TournamentGroup,
  TournamentMatch,
  TournamentRegistration,
} from '../database/entities';
import {
  groupRelations,
  matchRelations,
  teamRelations,
} from '../database/relations';
import {
  groupResponse,
  paginate,
  teamResponse,
  tournamentResponse,
} from '../common/serializers';
import {
  CreateTournamentDto,
  TournamentQueryDto,
  UpdateTournamentDto,
} from './tournaments.dto';

@Injectable()
export class TournamentsService {
  constructor(
    private readonly db: DataSource,
    private readonly competition: CompetitionService,
  ) {}

  async index(query: TournamentQueryDto) {
    const builder = this.db
      .getRepository(Tournament)
      .createQueryBuilder('tournament')
      .loadRelationCountAndMap('tournament.teamsCount', 'tournament.teams')
      .loadRelationCountAndMap('tournament.groupsCount', 'tournament.groups')
      .loadRelationCountAndMap('tournament.matchesCount', 'tournament.matches')
      .orderBy('tournament.startsAt', 'ASC', 'NULLS LAST')
      .addOrderBy('tournament.createdAt', 'DESC')
      .skip((query.page - 1) * query.per_page)
      .take(query.per_page);
    if (query.search)
      builder.andWhere('tournament.name ILIKE :search', {
        search: `%${query.search}%`,
      });
    if (query.status)
      builder.andWhere('tournament.status = :status', { status: query.status });
    const [items, total] = await builder.getManyAndCount();
    return paginate(
      items.map(tournamentResponse),
      total,
      query.page,
      query.per_page,
    );
  }

  async create(dto: CreateTournamentDto) {
    const repo = this.db.getRepository(Tournament);
    if (dto.status && dto.status !== 'draft')
      businessValidation('status', 'Giải mới phải ở trạng thái chuẩn bị.');
    if (
      dto.starts_at &&
      dto.ends_at &&
      new Date(dto.starts_at) >= new Date(dto.ends_at)
    )
      businessValidation('ends_at', 'Thời gian kết thúc phải sau bắt đầu.');
    dto.slug ||= `${
      dto.name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 130) || 'giai-dau'
    }-${randomUUID().slice(0, 8)}`;
    if (
      dto.settings &&
      Object.keys(dto.settings).some((key) =>
        [
          'roster_locked',
          'bracket_engine',
          'finalized',
          'rating_applied',
          'competition',
          'tie_breaks',
          'operation_status',
          'operation_reason',
          'operation_changed_at',
          'operation_history',
          'roster_snapshot',
          'finalized_at',
          'qualifiers_per_group',
        ].includes(key),
      )
    )
      businessValidation('settings', 'Dùng API điều lệ để cấu hình giải.');
    return tournamentResponse(await repo.save(repo.create(this.data(dto))));
  }

  async show(id: string) {
    const tournament = await this.db
      .getRepository(Tournament)
      .findOneByOrFail({ id });
    const [teams, groups, matches] = await Promise.all([
      this.db.getRepository(Team).find({
        where: { tournamentId: id },
        relations: teamRelations,
        order: { seed: { direction: 'ASC', nulls: 'LAST' } },
      }),
      this.db.getRepository(TournamentGroup).find({
        where: { tournamentId: id },
        relations: groupRelations,
        order: { sortOrder: 'ASC', teams: { position: 'ASC' } },
      }),
      this.db
        .getRepository(TournamentMatch)
        .find({ where: { tournamentId: id }, relations: matchRelations }),
    ]);
    return {
      ...tournamentResponse(tournament),
      teams: teams.map(teamResponse),
      groups: groups.map((group) =>
        groupResponse({
          ...group,
          matches: matches.filter((match) => match.groupId === group.id),
        }),
      ),
    };
  }

  async update(id: string, dto: UpdateTournamentDto) {
    await this.competition.mutate(
      id,
      async (manager, item) => {
        const count = await manager.countBy(Team, { tournamentId: id });
        if (item.settings?.finalized)
          businessValidation(
            'tournament',
            'Giải đã chốt, không được chỉnh sửa.',
          );
        const registrations = await manager.findBy(TournamentRegistration, {
          tournamentId: id,
        });
        const capacity =
          (dto.max_teams ?? item.maxTeams) *
          ((dto.format ?? item.format) === 'single' ? 1 : 2);
        if (
          registrations.filter((r) => r.status !== 'withdrawn').length >
          capacity
        )
          businessValidation(
            'max_teams',
            'Sức chứa nhỏ hơn danh sách đã đăng ký.',
          );
        if (
          dto.format &&
          dto.format !== item.format &&
          (count || item.settings?.roster_locked)
        )
          businessValidation(
            'format',
            'Không đổi đơn/đôi sau khi chốt danh sách hoặc tạo suất thi đấu.',
          );
        if (dto.max_teams !== undefined && dto.max_teams < count)
          businessValidation(
            'max_teams',
            'Số suất tối đa nhỏ hơn danh sách hiện tại.',
          );
        if (dto.status !== undefined && dto.status !== item.status)
          businessValidation(
            'status',
            'Trạng thái giải được cập nhật qua quy trình thi đấu.',
          );
        if (dto.settings !== undefined) {
          const protectedKeys = [
            'operation_status',
            'operation_reason',
            'operation_changed_at',
            'operation_history',
            'roster_snapshot',
            'roster_locked',
            'bracket_engine',
            'finalized',
            'rating_applied',
            'finalized_at',
            'competition',
            'qualifiers_per_group',
            'tie_breaks',
          ];
          if (
            dto.settings &&
            Object.keys(dto.settings).some((key) => protectedKeys.includes(key))
          )
            businessValidation(
              'settings',
              'Dùng API điều lệ, không ghi đè trạng thái nội bộ.',
            );
          const internal = Object.fromEntries(
            Object.entries(item.settings ?? {}).filter(([key]) =>
              protectedKeys.includes(key),
            ),
          );
          dto.settings = Object.keys(internal).length
            ? { ...dto.settings, ...internal }
            : dto.settings;
        }
        const data = this.data(dto);
        const start =
          data.startsAt !== undefined
            ? (data.startsAt as Date | null)
            : item.startsAt;
        const end =
          data.endsAt !== undefined
            ? (data.endsAt as Date | null)
            : item.endsAt;
        if (start && end && start >= end)
          businessValidation('ends_at', 'Thời gian kết thúc phải sau bắt đầu.');
        const fixtures = await manager.findBy(TournamentMatch, {
          tournamentId: id,
        });
        if (
          fixtures.some(
            (m) =>
              m.scheduledAt &&
              ((start && m.scheduledAt < start) ||
                (end &&
                  m.scheduledAt.getTime() +
                    Number(m.metadata?.slot_minutes ?? 30) * 60000 >
                    end.getTime())),
          )
        )
          businessValidation(
            'starts_at',
            'Khoảng thời gian mới không chứa toàn bộ lịch thi đấu.',
          );
        if (
          dto.courts !== undefined &&
          (dto.courts ?? 2) < item.courts &&
          fixtures.some((m) => m.court)
        )
          businessValidation(
            'courts',
            'Không giảm số sân sau khi đã xếp lịch; cần xếp lại lịch trước.',
          );
        await manager.save(Tournament, manager.merge(Tournament, item, data));
      },
      false,
      true,
    );
    return tournamentResponse(
      await this.db.getRepository(Tournament).findOneByOrFail({ id }),
    );
  }

  async remove(id: string) {
    await this.competition.mutate(
      id,
      async (manager, tournament) => {
        const matches = await manager.findBy(TournamentMatch, {
          tournamentId: id,
        });
        if (
          tournament.settings?.finalized ||
          matches.some((m) => m.winnerTeamId)
        )
          businessValidation(
            'tournament',
            'Không được xóa giải đã có kết quả.',
          );
        await manager.delete(Tournament, id);
      },
      false,
      true,
    );
  }

  private data(
    dto: CreateTournamentDto | UpdateTournamentDto,
  ): DeepPartial<Tournament> {
    return {
      ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.format !== undefined ? { format: dto.format } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.location !== undefined ? { location: dto.location } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(dto.cover_url !== undefined ? { coverUrl: dto.cover_url } : {}),
      ...(dto.max_teams !== undefined ? { maxTeams: dto.max_teams } : {}),
      ...(dto.starts_at !== undefined
        ? { startsAt: dto.starts_at ? new Date(dto.starts_at) : null }
        : {}),
      ...(dto.ends_at !== undefined
        ? { endsAt: dto.ends_at ? new Date(dto.ends_at) : null }
        : {}),
      ...(dto.courts !== undefined ? { courts: dto.courts ?? 2 } : {}),
      ...(dto.settings !== undefined ? { settings: dto.settings } : {}),
    };
  }
}
