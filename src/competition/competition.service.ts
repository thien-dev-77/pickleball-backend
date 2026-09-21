import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { BracketsManager, helpers } from 'brackets-manager';
import { InMemoryDatabase } from 'brackets-memory-db';
import type { Database } from 'brackets-model';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  GroupTeam,
  Player,
  RatingAssessment,
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
  matchResponse,
  playerResponse,
  teamResponse,
  tournamentResponse,
} from '../common/serializers';
import { businessValidation } from '../common/validation';
import {
  CompetitionSettingsDto,
  AssignmentDto,
  TieBreakDto,
  DrawDto,
  EntriesDto,
  PlayoffDto,
  RegistrationDto,
  RegistrationUpdateDto,
  ScheduleDto,
  ScoreDto,
  TournamentOperationDto,
} from './competition.dto';
import { rankGroup } from './standings';
import { rosterPlayer, rosterSnapshot } from '../common/roster-snapshot';

type Rules = {
  division: string;
  min_rating: number;
  max_rating: number;
  max_team_rating: number;
  group_target: number;
  knockout_target: number;
  group_best_of: number;
  knockout_best_of: number;
};

export function competitionRules(tournament: Tournament): Rules {
  const rules = (tournament.settings?.competition ?? {}) as Partial<Rules>;
  return {
    division: 'open',
    min_rating: 1,
    max_rating: 6,
    max_team_rating: 12,
    group_target: 11,
    knockout_target: 11,
    group_best_of: 1,
    knockout_best_of: 1,
    ...rules,
  };
}

@Injectable()
export class CompetitionService {
  constructor(private readonly db: DataSource) {}

  async workspace(id: string) {
    const tournament = await this.db
      .getRepository(Tournament)
      .findOneByOrFail({ id });
    const [registrations, teams, groups, matches] = await Promise.all([
      this.db.getRepository(TournamentRegistration).find({
        where: { tournamentId: id },
        relations: { player: true },
        order: { createdAt: 'ASC' },
      }),
      this.db.getRepository(Team).find({
        where: { tournamentId: id },
        relations: teamRelations,
        order: { seed: 'ASC' },
      }),
      this.db.getRepository(TournamentGroup).find({
        where: { tournamentId: id },
        relations: groupRelations,
        order: { sortOrder: 'ASC', teams: { position: 'ASC' } },
      }),
      this.db.getRepository(TournamentMatch).find({
        where: { tournamentId: id },
        relations: matchRelations,
        order: {
          scheduledAt: { direction: 'ASC', nulls: 'LAST' },
          createdAt: 'ASC',
        },
      }),
    ]);
    const assigned = new Set(
      teams.flatMap((t) => [t.playerOneId, t.playerTwoId].filter(Boolean)),
    );
    const confirmed = registrations.filter((r) => r.status === 'confirmed');
    return {
      tournament: tournamentResponse(tournament),
      rules: competitionRules(tournament),
      registrations: registrations.map((r) => ({
        id: r.id,
        player_id: r.playerId,
        status: r.status,
        notes: r.notes,
        player: playerResponse(r.player),
        entry_profile: tournament.settings?.roster_locked
          ? {
              rating: rosterPlayer(r.player, tournament).rating,
              gender: rosterPlayer(r.player, tournament).gender,
            }
          : null,
      })),
      teams: teams.map(teamResponse),
      groups: groups.map((g) => ({
        ...groupResponse(g),
        standings: rankGroup(
          g.teams.map((m) => m.team),
          matches.filter((m) => m.groupId === g.id),
          this.tieOrder(tournament, g.id),
        ).map((row) => ({ ...row, team: teamResponse(row.team) })),
      })),
      matches: matches.map(matchResponse),
      progress: {
        confirmed: confirmed.length,
        unassigned: confirmed.filter((r) => !assigned.has(r.playerId)).length,
        roster_locked: tournament.settings?.roster_locked === true,
        completed: matches.filter(
          (m) => m.winnerTeamId && m.metadata?.kind !== 'bye',
        ).length,
        total: matches.filter((m) => m.metadata?.kind !== 'bye').length,
        rating_applied: tournament.settings?.rating_applied === true,
      },
    };
  }

  async mutate<T>(
    id: string,
    action: (manager: EntityManager, tournament: Tournament) => Promise<T>,
    allowFinalized = false,
    allowStopped = false,
  ): Promise<T> {
    return this.db.transaction(async (manager) => {
      const tournament = await manager.findOneOrFail(Tournament, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (tournament.settings?.finalized && !allowFinalized)
        businessValidation(
          'tournament',
          'Giải đã chốt, không được thay đổi dữ liệu.',
        );
      if (!allowStopped && tournament.settings?.operation_status === 'paused')
        businessValidation(
          'tournament',
          'Giải đang tạm ngừng. Tiếp tục giải trước khi thay đổi dữ liệu thi đấu.',
        );
      if (
        !allowStopped &&
        tournament.settings?.operation_status === 'cancelled'
      )
        businessValidation(
          'tournament',
          'Giải đã hủy, không được thay đổi dữ liệu thi đấu.',
        );
      return action(manager, tournament);
    });
  }

  async operation(id: string, dto: TournamentOperationDto) {
    await this.mutate(
      id,
      async (manager, tournament) => {
        const state = tournament.settings?.operation_status ?? 'active';
        if (state === 'cancelled')
          businessValidation(
            'action',
            'Giải đã hủy, không thể tiếp tục hoặc đổi trạng thái.',
          );
        if (tournament.status === 'completed')
          businessValidation(
            'action',
            'Giải đã hoàn thành, không thể ngừng hoặc hủy.',
          );
        if (dto.action === 'resume' && state !== 'paused')
          businessValidation('action', 'Chỉ tiếp tục giải đang tạm ngừng.');
        if (dto.action === 'pause' && state !== 'active')
          businessValidation('action', 'Giải đã được tạm ngừng.');
        const reason = dto.reason?.trim() || null;
        if (dto.action !== 'resume' && !reason)
          businessValidation('reason', 'Nhập lý do tạm ngừng hoặc hủy giải.');
        const at = new Date().toISOString();
        const history = (tournament.settings?.operation_history ??
          []) as unknown[];
        const settings: Record<string, unknown> = {
          ...tournament.settings,
          operation_status:
            dto.action === 'pause'
              ? 'paused'
              : dto.action === 'cancel'
                ? 'cancelled'
                : 'active',
          operation_reason: dto.action === 'resume' ? null : reason,
          operation_changed_at: at,
          operation_history: [...history, { action: dto.action, reason, at }],
        };
        tournament.settings = settings;
        await manager.save(Tournament, tournament);
      },
      false,
      true,
    );
    return this.workspace(id);
  }

  tieOrder(tournament: Tournament, groupId: string): string[] {
    const resolutions = tournament.settings?.tie_breaks as
      Record<string, { order: string[] }> | undefined;
    return resolutions?.[groupId]?.order ?? [];
  }

  async assignment(id: string, dto: AssignmentDto) {
    await this.mutate(id, async (manager) => {
      if (await manager.countBy(TournamentMatch, { tournamentId: id }))
        businessValidation('groups', 'Không chuyển bảng sau khi đã xếp lịch.');
      await manager.findOneByOrFail(Team, {
        id: dto.team_id,
        tournamentId: id,
      });
      await manager.findOneByOrFail(TournamentGroup, {
        id: dto.group_id,
        tournamentId: id,
      });
      await manager.delete(GroupTeam, { teamId: dto.team_id });
      await manager.save(
        GroupTeam,
        manager.create(GroupTeam, {
          teamId: dto.team_id,
          groupId: dto.group_id,
          position:
            (await manager.countBy(GroupTeam, { groupId: dto.group_id })) + 1,
        }),
      );
    });
    return this.workspace(id);
  }

  async tieBreak(id: string, dto: TieBreakDto) {
    await this.mutate(id, async (manager, tournament) => {
      if (!dto.reason.trim())
        businessValidation(
          'reason',
          'Cần ghi phương pháp phân hạng và quyết định của ban tổ chức.',
        );
      const all = await manager.findBy(TournamentMatch, { tournamentId: id });
      if (all.some((m) => m.stage !== 'group'))
        businessValidation('result', 'Đã lên nhánh, không được sửa phân hạng.');
      const group = await manager.findOneOrFail(TournamentGroup, {
        where: { id: dto.group_id, tournamentId: id },
        relations: { teams: { team: true } },
      });
      const matches = all.filter((m) => m.groupId === group.id);
      if (!matches.length || matches.some((m) => !m.winnerTeamId))
        businessValidation(
          'matches',
          'Hoàn tất vòng bảng trước khi phân hạng.',
        );
      const ids = group.teams.map((t) => t.teamId);
      if (
        dto.team_ids.length !== ids.length ||
        new Set(dto.team_ids).size !== ids.length ||
        dto.team_ids.some((team) => !ids.includes(team))
      )
        businessValidation(
          'team_ids',
          'Thứ tự phải gồm mỗi suất của bảng đúng một lần.',
        );
      const prior = (tournament.settings?.tie_breaks ?? {}) as Record<
        string,
        unknown
      >;
      await manager.update(Tournament, id, {
        settings: {
          ...tournament.settings,
          tie_breaks: {
            ...prior,
            [group.id]: {
              order: dto.team_ids,
              reason: dto.reason.trim(),
              at: new Date().toISOString(),
            },
          },
        },
      });
    });
    return this.workspace(id);
  }

  private async noResults(manager: EntityManager, id: string) {
    const matches = await manager.findBy(TournamentMatch, { tournamentId: id });
    if (matches.some((m) => m.winnerTeamId && m.metadata?.kind !== 'bye'))
      businessValidation(
        'matches',
        'Giải đã có kết quả. Không được tạo lại đội, bảng hoặc lịch.',
      );
  }

  async editableEntries(manager: EntityManager, id: string) {
    await this.noResults(manager, id);
    if (await manager.countBy(TournamentGroup, { tournamentId: id }))
      businessValidation(
        'teams',
        'Đã chia bảng, không được thay đổi suất thi đấu.',
      );
  }

  private eligible(player: Player, tournament: Tournament) {
    const rules = competitionRules(tournament);
    if (player.rating < rules.min_rating || player.rating > rules.max_rating)
      businessValidation(
        'player_ids',
        `${player.name} ngoài khoảng điểm trình của giải.`,
      );
    if (
      ['male', 'female'].includes(rules.division) &&
      player.gender !== rules.division
    )
      businessValidation(
        'player_ids',
        `${player.name} không phù hợp nội dung thi đấu.`,
      );
    if (
      rules.division === 'mixed' &&
      !['male', 'female'].includes(player.gender)
    )
      businessValidation(
        'player_ids',
        'Nội dung đôi nam nữ cần VĐV nam hoặc nữ.',
      );
  }

  async register(id: string, dto: RegistrationDto) {
    await this.mutate(id, async (manager, tournament) => {
      if (
        tournament.settings?.roster_locked ||
        tournament.status === 'completed'
      )
        businessValidation(
          'roster',
          'Danh sách đã chốt. Mở danh sách trước khi thêm VĐV.',
        );
      if (new Set(dto.player_ids).size !== dto.player_ids.length)
        businessValidation('player_ids', 'VĐV không được trùng lặp.');
      const players = await manager.findBy(Player, { id: In(dto.player_ids) });
      if (players.length !== dto.player_ids.length)
        businessValidation('player_ids', 'Không tìm thấy một hoặc nhiều VĐV.');
      const existing = await manager.findBy(TournamentRegistration, {
        tournamentId: id,
      });
      const active = new Set(
        existing.filter((r) => r.status !== 'withdrawn').map((r) => r.playerId),
      );
      dto.player_ids.forEach((playerId) => active.add(playerId));
      if (
        active.size >
        tournament.maxTeams * (tournament.format === 'single' ? 1 : 2)
      )
        businessValidation(
          'player_ids',
          'Danh sách vượt số suất tối đa của giải.',
        );
      for (const player of players) {
        this.eligible(player, tournament);
        const registration = existing.find((r) => r.playerId === player.id);
        if (registration?.status !== 'withdrawn' && registration) {
          if (
            registration.status === 'registered' &&
            dto.status === 'confirmed'
          )
            await manager.update(TournamentRegistration, registration.id, {
              status: 'confirmed',
            });
          continue;
        }
        await manager.save(
          TournamentRegistration,
          manager.create(TournamentRegistration, {
            ...registration,
            tournamentId: id,
            playerId: player.id,
            status: dto.status,
          }),
        );
      }
    });
    return this.workspace(id);
  }

  async registration(id: string, playerId: string, dto: RegistrationUpdateDto) {
    await this.mutate(id, async (manager, tournament) => {
      if (tournament.settings?.roster_locked)
        businessValidation('roster', 'Danh sách đã chốt.');
      const registration = await manager.findOneOrFail(TournamentRegistration, {
        where: { tournamentId: id, playerId },
        relations: { player: true },
      });
      if (dto.status === 'confirmed')
        this.eligible(registration.player, tournament);
      if (registration.status === 'withdrawn' && dto.status !== 'withdrawn') {
        const entries = await manager.findBy(TournamentRegistration, {
          tournamentId: id,
        });
        if (
          entries.filter((r) => r.status !== 'withdrawn').length >=
          tournament.maxTeams * (tournament.format === 'single' ? 1 : 2)
        )
          businessValidation('status', 'Danh sách đã đủ sức chứa của giải.');
      }
      if (
        dto.status !== 'confirmed' &&
        (await manager.count(Team, {
          where: [
            { tournamentId: id, playerOneId: playerId },
            { tournamentId: id, playerTwoId: playerId },
          ],
        }))
      )
        businessValidation(
          'status',
          'VĐV đã có suất thi đấu. Xóa suất hoặc cặp trước khi rút đăng ký.',
        );
      await manager.update(TournamentRegistration, registration.id, {
        status: dto.status,
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      });
    });
    return this.workspace(id);
  }

  async rosterLock(id: string, locked: boolean) {
    await this.mutate(id, async (manager, tournament) => {
      if (locked && tournament.settings?.roster_locked) return;
      if (await manager.countBy(TournamentGroup, { tournamentId: id }))
        businessValidation(
          'roster',
          'Đã chia bảng, không thể thay đổi danh sách đăng ký.',
        );
      const registrations = await manager.find(TournamentRegistration, {
        where: { tournamentId: id },
        relations: { player: true },
      });
      const confirmed = registrations.filter((r) => r.status === 'confirmed');
      if (locked) {
        if (registrations.some((r) => r.status === 'registered'))
          businessValidation(
            'roster',
            'Còn VĐV chưa xác nhận. Xác nhận hoặc rút đăng ký trước khi chốt.',
          );
        if (confirmed.length < (tournament.format === 'single' ? 2 : 4))
          businessValidation('roster', 'Chưa đủ VĐV để tổ chức giải.');
        if (tournament.format === 'double' && confirmed.length % 2)
          businessValidation('roster', 'Giải đôi cần số VĐV chẵn.');
        confirmed.forEach((r) => this.eligible(r.player, tournament));
      }
      const settings: Record<string, unknown> = {
        ...tournament.settings,
        roster_locked: locked,
        roster_snapshot: locked ? rosterSnapshot(registrations) : null,
      };
      tournament.settings = settings;
      await manager.save(Tournament, tournament);
    });
    return this.workspace(id);
  }

  async settings(id: string, dto: CompetitionSettingsDto) {
    await this.mutate(id, async (manager, tournament) => {
      if (
        tournament.settings?.roster_locked ||
        (await manager.countBy(Team, { tournamentId: id }))
      )
        businessValidation(
          'settings',
          'Chỉ thay đổi điều lệ trước khi tạo suất thi đấu.',
        );
      const rules = { ...competitionRules(tournament), ...dto };
      if (
        rules.min_rating > rules.max_rating ||
        (rules.division === 'mixed' && tournament.format === 'single')
      )
        businessValidation(
          'settings',
          'Khoảng điểm hoặc nội dung nam nữ không hợp lệ.',
        );
      await manager.update(Tournament, id, {
        settings: { ...tournament.settings, competition: rules },
      });
    });
    return this.workspace(id);
  }

  async assertEntryPlayers(
    manager: EntityManager,
    tournament: Tournament,
    playerIds: string[],
    excludingTeam?: string,
  ) {
    if (!tournament.settings?.roster_locked)
      businessValidation(
        'roster',
        'Chốt danh sách VĐV tham gia trước khi tạo suất thi đấu.',
      );
    const registrations = await manager.find(TournamentRegistration, {
      where: {
        tournamentId: tournament.id,
        playerId: In(playerIds),
        status: 'confirmed',
      },
      relations: { player: true },
    });
    if (
      registrations.length !== playerIds.length ||
      new Set(playerIds).size !== playerIds.length
    )
      businessValidation(
        'player_ids',
        'Chỉ dùng VĐV đã xác nhận trong giải, mỗi người một suất.',
      );
    const teams = await manager.findBy(Team, { tournamentId: tournament.id });
    if (
      teams.some(
        (t) =>
          t.id !== excludingTeam &&
          playerIds.some((id) => [t.playerOneId, t.playerTwoId].includes(id)),
      )
    )
      businessValidation('player_ids', 'VĐV đã thuộc suất thi đấu khác.');
    const players = playerIds.map(
      (id) => registrations.find((r) => r.playerId === id)!.player,
    );
    this.validateMembers(players, tournament);
    return players;
  }

  private validateMembers(players: Player[], tournament: Tournament) {
    players.forEach((player) => this.eligible(player, tournament));
    const rules = competitionRules(tournament);
    if (
      (tournament.format === 'double' && players.length !== 2) ||
      (tournament.format === 'single' && players.length !== 1)
    )
      businessValidation(
        'player_ids',
        'Số thành viên không phù hợp thể thức đơn/đôi.',
      );
    if (players.reduce((sum, p) => sum + p.rating, 0) > rules.max_team_rating)
      businessValidation('player_ids', 'Tổng điểm cặp vượt giới hạn của giải.');
    if (
      rules.division === 'mixed' &&
      new Set(players.map((p) => p.gender)).size !== 2
    )
      businessValidation(
        'player_ids',
        'Cặp nam nữ cần một VĐV nam và một VĐV nữ.',
      );
  }

  async entries(id: string, dto: EntriesDto) {
    await this.mutate(id, async (manager, tournament) => {
      await this.noResults(manager, id);
      const existing = await manager.countBy(Team, { tournamentId: id });
      if (existing && !dto.replace)
        businessValidation(
          'replace',
          'Đã có suất thi đấu. Xác nhận tạo lại danh sách.',
        );
      if (!tournament.settings?.roster_locked)
        businessValidation('roster', 'Chốt danh sách VĐV trước khi ghép.');
      const registrations = await manager.find(TournamentRegistration, {
        where: { tournamentId: id, status: 'confirmed' },
        relations: { player: true },
      });
      const ids = dto.player_ids ?? registrations.map((r) => r.playerId);
      if (
        !ids.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !registrations.some((r) => r.playerId === id))
      )
        businessValidation(
          'player_ids',
          'Danh sách phải gồm VĐV đã xác nhận trong giải.',
        );
      const pool = registrations
        .filter((r) => ids.includes(r.playerId))
        .map((r) => r.player)
        .sort((a, b) => b.rating - a.rating);
      const entries: Player[][] = [];
      if (tournament.format === 'single')
        pool.forEach((p) => entries.push([p]));
      else {
        if (pool.length % 2)
          businessValidation('player_ids', 'Số VĐV ghép đôi phải chẵn.');
        if (competitionRules(tournament).division === 'mixed') {
          const men = pool.filter((p) => p.gender === 'male'),
            women = pool.filter((p) => p.gender === 'female');
          if (men.length !== women.length)
            businessValidation(
              'player_ids',
              'Đôi nam nữ cần số lượng nam và nữ bằng nhau.',
            );
          while (men.length)
            entries.push([
              men.shift()!,
              dto.balance ? women.pop()! : women.shift()!,
            ]);
        } else
          while (pool.length)
            entries.push([
              pool.shift()!,
              dto.balance ? pool.pop()! : pool.shift()!,
            ]);
      }
      if (entries.length > tournament.maxTeams)
        businessValidation('player_ids', 'Vượt số suất thi đấu tối đa.');
      entries.forEach((members) => this.validateMembers(members, tournament));
      await manager.delete(TournamentMatch, { tournamentId: id });
      await manager.delete(TournamentGroup, { tournamentId: id });
      await manager.delete(Team, { tournamentId: id });
      await manager.save(
        Team,
        entries.map((players, index) =>
          manager.create(Team, {
            tournamentId: id,
            name: players.map((p) => p.name).join(' / '),
            playerOneId: players[0].id,
            playerTwoId: players[1]?.id ?? null,
            totalRating: players.reduce((sum, p) => sum + p.rating, 0),
            seed: index + 1,
          }),
        ),
      );
      await manager.update(Tournament, id, {
        status: 'draft',
        settings: { ...tournament.settings, bracket_engine: false },
      });
    });
    return this.workspace(id);
  }

  async draw(id: string, dto: DrawDto) {
    await this.mutate(id, async (manager, tournament) => {
      await this.noResults(manager, id);
      if (!tournament.settings?.roster_locked)
        businessValidation('roster', 'Chốt danh sách trước khi chia bảng.');
      const teams = await manager.find(Team, {
        where: { tournamentId: id },
        order: { seed: 'ASC' },
      });
      const confirmed = await manager.findBy(TournamentRegistration, {
        tournamentId: id,
        status: 'confirmed',
      });
      const assigned = new Set(
        teams.flatMap((t) => [t.playerOneId, t.playerTwoId]),
      );
      if (confirmed.some((r) => !assigned.has(r.playerId)))
        businessValidation('teams', 'Còn VĐV xác nhận chưa có suất thi đấu.');
      if (teams.length < 2 || dto.group_count > Math.floor(teams.length / 2))
        businessValidation(
          'group_count',
          'Mỗi bảng cần ít nhất hai suất thi đấu.',
        );
      if (
        (await manager.countBy(TournamentGroup, { tournamentId: id })) &&
        !dto.replace
      )
        businessValidation('replace', 'Đã có bảng. Xác nhận chia lại.');
      if (dto.mode === 'random')
        for (let i = teams.length - 1; i > 0; i--) {
          const j = randomInt(i + 1);
          [teams[i], teams[j]] = [teams[j], teams[i]];
        }
      await manager.delete(TournamentMatch, { tournamentId: id });
      await manager.delete(TournamentGroup, { tournamentId: id });
      const groups = await manager.save(
        TournamentGroup,
        Array.from({ length: dto.group_count }, (_, i) =>
          manager.create(TournamentGroup, {
            tournamentId: id,
            name: `Bảng ${i + 1}`,
            sortOrder: i + 1,
          }),
        ),
      );
      await manager.save(
        GroupTeam,
        teams.map((team, i) => {
          const bucket =
            dto.mode === 'seeded' && Math.floor(i / groups.length) % 2
              ? groups.length - 1 - (i % groups.length)
              : i % groups.length;
          return manager.create(GroupTeam, {
            groupId: groups[bucket].id,
            teamId: team.id,
            position: Math.floor(i / groups.length) + 1,
          });
        }),
      );
      await manager.update(Tournament, id, {
        status: 'group',
        settings: { ...tournament.settings, bracket_engine: false },
      });
    });
    return this.workspace(id);
  }

  async schedule(id: string, dto: ScheduleDto) {
    await this.mutate(id, async (manager, tournament) => {
      await this.noResults(manager, id);
      if (
        (await manager.countBy(TournamentMatch, { tournamentId: id })) &&
        !dto.replace
      )
        businessValidation('replace', 'Đã có lịch. Xác nhận xếp lại.');
      const groups = await manager.find(TournamentGroup, {
        where: { tournamentId: id },
        relations: { teams: true },
        order: { sortOrder: 'ASC', teams: { position: 'ASC' } },
      });
      if (!groups.length || groups.some((g) => g.teams.length < 2))
        businessValidation('groups', 'Cần các bảng có ít nhất hai suất.');
      if (dto.court_count > tournament.courts)
        businessValidation('court_count', 'Số sân vượt cấu hình giải.');
      await manager.delete(TournamentMatch, { tournamentId: id });
      const courts = Array<number>(dto.court_count).fill(0),
        available = new Map<string, number>();
      const rounds = groups.map((group) => ({
        group,
        rounds: helpers.makeRoundRobinMatches(group.teams.map((t) => t.teamId)),
      }));
      const start = new Date(dto.starts_at).getTime();
      const fixtures: TournamentMatch[] = [];
      if (tournament.startsAt && start < tournament.startsAt.getTime())
        businessValidation(
          'starts_at',
          'Lịch không được bắt đầu trước thời gian giải.',
        );
      for (
        let round = 0;
        round < Math.max(...rounds.map((r) => r.rounds.length));
        round++
      )
        for (const group of rounds)
          for (const [a, b] of group.rounds[round] ?? []) {
            if (!a || !b) continue;
            const court = courts.indexOf(Math.min(...courts));
            const time = Math.max(
              courts[court],
              available.get(a) ?? 0,
              available.get(b) ?? 0,
            );
            if (
              tournament.endsAt &&
              start + (time + dto.slot_minutes) * 60000 >
                tournament.endsAt.getTime()
            )
              businessValidation(
                'starts_at',
                'Lịch vượt thời gian kết thúc giải.',
              );
            fixtures.push(
              manager.create(TournamentMatch, {
                tournamentId: id,
                groupId: group.group.id,
                stage: 'group',
                round: `Lượt ${round + 1}`,
                court: `Sân ${court + 1}`,
                teamAId: a,
                teamBId: b,
                scheduledAt: new Date(start + time * 60000),
                metadata: {
                  slot_minutes: dto.slot_minutes,
                  rest_minutes: dto.rest_minutes,
                },
              }),
            );
            courts[court] = time + dto.slot_minutes;
            available.set(a, time + dto.slot_minutes + dto.rest_minutes);
            available.set(b, time + dto.slot_minutes + dto.rest_minutes);
          }
      await manager.save(TournamentMatch, fixtures);
      await manager.update(Tournament, id, {
        status: 'group',
        settings: { ...tournament.settings, bracket_engine: false },
      });
    });
    return this.workspace(id);
  }

  async resetPlayoff(id: string) {
    await this.mutate(id, async (manager, tournament) => {
      const fixtures = await manager.findBy(TournamentMatch, {
        tournamentId: id,
      });
      if (
        tournament.settings?.finalized ||
        fixtures.some(
          (m) =>
            m.stage !== 'group' && m.winnerTeamId && m.metadata?.kind !== 'bye',
        )
      )
        businessValidation(
          'matches',
          'Không được gỡ nhánh đã thi đấu hoặc giải đã chốt.',
        );
      for (const fixture of fixtures.filter((m) => m.stage !== 'group'))
        await manager.delete(TournamentMatch, fixture.id);
      await manager.update(Tournament, id, {
        status: 'group',
        settings: { ...tournament.settings, bracket_engine: false },
      });
    });
    return this.workspace(id);
  }

  async playoff(id: string, dto: PlayoffDto) {
    await this.mutate(id, async (manager, tournament) => {
      const matches = await manager.findBy(TournamentMatch, {
        tournamentId: id,
      });
      const knockout = matches.filter((m) => m.stage !== 'group');
      if (knockout.some((m) => m.winnerTeamId && m.metadata?.kind !== 'bye'))
        businessValidation(
          'matches',
          'Nhánh đã có kết quả, không được tạo lại.',
        );
      if (knockout.length && !dto.replace)
        businessValidation('replace', 'Nhánh đã tồn tại. Xác nhận tạo lại.');
      const groups = await manager.find(TournamentGroup, {
        where: { tournamentId: id },
        relations: { teams: { team: true } },
        order: { sortOrder: 'ASC' },
      });
      const rankings = groups.map((g) => {
        const fixtures = matches.filter((m) => m.groupId === g.id);
        if (
          g.teams.length < 2 ||
          fixtures.length !== (g.teams.length * (g.teams.length - 1)) / 2 ||
          fixtures.some((m) => !m.winnerTeamId)
        )
          businessValidation(
            'matches',
            `${g.name} chưa đủ lịch hoặc chưa nhập hết kết quả.`,
          );
        const ranked = rankGroup(
          g.teams.map((t) => t.team),
          fixtures,
          this.tieOrder(tournament, g.id),
        );
        const count = Math.min(dto.qualifiers_per_group, ranked.length);
        if (
          count < ranked.length &&
          ranked[count - 1].tied &&
          ranked[count].tied &&
          ranked[count - 1].wins === ranked[count].wins &&
          ranked[count - 1].head_to_head === ranked[count].head_to_head &&
          ranked[count - 1].diff === ranked[count].diff &&
          ranked[count - 1].points_for === ranked[count].points_for
        )
          businessValidation(
            'standings',
            `${g.name} hòa ở vị trí đi tiếp. Cần điều chỉnh điều lệ hoặc thi đấu phân hạng.`,
          );
        return ranked.slice(0, count);
      });
      let seeds = Array.from(
        { length: Math.max(0, ...rankings.map((r) => r.length)) },
        (_, rank) =>
          rankings.flatMap((pool) => (pool[rank] ? [pool[rank].team.id] : [])),
      ).flat();
      if (rankings.length === 2 && rankings.every((r) => r.length === 2))
        seeds = [
          rankings[0][0].team.id,
          rankings[1][0].team.id,
          rankings[0][1].team.id,
          rankings[1][1].team.id,
        ];
      if (seeds.length < 2)
        businessValidation('teams', 'Cần ít nhất hai suất đi tiếp.');
      const storage = new InMemoryDatabase();
      const engine = new BracketsManager(storage);
      const size = 2 ** Math.ceil(Math.log2(seeds.length));
      await engine.create.stage({
        tournamentId: 0,
        name: 'Playoff',
        type: 'single_elimination',
        seeding: [...seeds, ...Array<null>(size - seeds.length).fill(null)],
        settings: {
          seedOrdering: ['inner_outer'],
          consolationFinal: dto.consolation_final && seeds.length >= 4,
        },
      });
      const state = await engine.export();
      for (const match of knockout)
        await manager.delete(TournamentMatch, match.id);
      const maxRound = Math.max(
        ...state.round
          .filter(
            (r) => state.group.find((g) => g.id === r.group_id)?.number === 1,
          )
          .map((r) => r.number),
      );
      for (const match of state.match) {
        const round = state.round.find((r) => r.id === match.round_id)!;
        const bronze =
          state.group.find((g) => g.id === match.group_id)?.number === 2;
        const stage = bronze
          ? 'bronze'
          : round.number === maxRound
            ? 'final'
            : round.number === maxRound - 1
              ? 'semifinal'
              : 'knockout';
        const a =
          state.participant.find((p) => p.id === match.opponent1?.id)?.name ??
          null;
        const b =
          state.participant.find((p) => p.id === match.opponent2?.id)?.name ??
          null;
        const winner =
          match.opponent1?.result === 'win'
            ? a
            : match.opponent2?.result === 'win'
              ? b
              : null;
        await manager.save(
          TournamentMatch,
          manager.create(TournamentMatch, {
            tournamentId: id,
            stage,
            round: bronze
              ? 'Tranh hạng ba'
              : stage === 'final'
                ? 'Chung kết'
                : stage === 'semifinal'
                  ? `Bán kết ${match.number}`
                  : `Vòng ${size / 2 ** (round.number - 1)} - Trận ${match.number}`,
            teamAId: a,
            teamBId: b,
            winnerTeamId: winner,
            metadata: {
              engine_id: match.id,
              round_number: round.number,
              kind: winner ? 'bye' : null,
            },
          }),
        );
      }
      await manager.update(Tournament, id, {
        status: 'knockout',
        settings: {
          ...tournament.settings,
          bracket_engine: state,
          qualifiers_per_group: dto.qualifiers_per_group,
        },
      });
    });
    return this.workspace(id);
  }

  async score(matchId: string, dto: ScoreDto) {
    const current = await this.db
      .getRepository(TournamentMatch)
      .findOneByOrFail({ id: matchId });
    await this.mutate(current.tournamentId, async (manager, tournament) => {
      const match = await manager.findOneByOrFail(TournamentMatch, {
        id: matchId,
      });
      if (tournament.settings?.rating_applied || tournament.settings?.finalized)
        businessValidation(
          'result',
          'Giải đã chốt kết quả, không được sửa tỷ số.',
        );
      if (!match.teamAId || !match.teamBId || match.metadata?.kind === 'bye')
        businessValidation(
          'result',
          'Trận chưa đủ hai bên hoặc đã được miễn vòng.',
        );
      const fixtures = await manager.findBy(TournamentMatch, {
        tournamentId: tournament.id,
      });
      if (match.stage === 'group' && fixtures.some((m) => m.stage !== 'group'))
        businessValidation(
          'result',
          'Vòng bảng đã chốt để lên nhánh. Không được sửa kết quả vòng bảng.',
        );
      if (match.winnerTeamId && !dto.reason?.trim())
        businessValidation('reason', 'Cần ghi lý do sửa kết quả.');
      if (
        match.winnerTeamId &&
        fixtures.some(
          (m) =>
            m.stage !== 'group' &&
            m.id !== match.id &&
            m.winnerTeamId &&
            m.metadata?.kind !== 'bye' &&
            (Number(m.metadata?.round_number ?? 0) >
              Number(match.metadata?.round_number ?? 0) ||
              m.stage === 'bronze'),
        )
      )
        businessValidation(
          'result',
          'Vòng tiếp theo đã có kết quả, không được sửa trận trước.',
        );
      const rules = competitionRules(tournament),
        target =
          match.stage === 'group' ? rules.group_target : rules.knockout_target,
        bestOf =
          match.stage === 'group'
            ? rules.group_best_of
            : rules.knockout_best_of;
      let winsA = 0,
        winsB = 0,
        scoreA = 0,
        scoreB = 0;
      const needed = Math.floor(bestOf / 2) + 1;
      if (dto.kind !== 'normal' && dto.games.length)
        businessValidation(
          'games',
          'Vắng mặt/bỏ cuộc không ghi game hoàn tất theo điều lệ nội bộ.',
        );
      if (dto.kind === 'normal') {
        if (!dto.games.length || dto.games.length > bestOf)
          businessValidation('games', 'Số game không phù hợp điều lệ.');
        for (const game of dto.games) {
          if (winsA === needed || winsB === needed)
            businessValidation(
              'games',
              'Không nhập game sau khi đã xác định bên thắng.',
            );
          const high = Math.max(game.a, game.b),
            low = Math.min(game.a, game.b);
          if (
            high < target ||
            high - low < 2 ||
            (high > target && high - low !== 2)
          )
            businessValidation(
              'games',
              `Game phải đạt ${target} điểm và thắng cách biệt 2, dừng ngay khi có bên thắng.`,
            );
          if (game.a > game.b) winsA++;
          else winsB++;
          scoreA += game.a;
          scoreB += game.b;
        }
        if (Math.max(winsA, winsB) !== needed)
          businessValidation('games', 'Chưa đủ game thắng để kết thúc trận.');
      } else if (
        !dto.reason?.trim() ||
        ![match.teamAId, match.teamBId].includes(dto.winner_team_id ?? '')
      )
        businessValidation(
          'reason',
          'Bỏ cuộc cần chọn bên thắng và ghi lý do.',
        );
      const winner =
        dto.kind === 'normal'
          ? winsA > winsB
            ? match.teamAId
            : match.teamBId
          : dto.winner_team_id!;
      const history = [
        ...(Array.isArray(match.metadata?.history)
          ? (match.metadata.history as unknown[])
          : []),
        {
          at: new Date().toISOString(),
          previous: {
            score_a: match.scoreA,
            score_b: match.scoreB,
            winner_team_id: match.winnerTeamId,
            games: match.metadata?.games ?? null,
            kind: match.metadata?.kind ?? null,
          },
          reason: dto.reason ?? null,
        },
      ];
      await manager.update(TournamentMatch, match.id, {
        scoreA,
        scoreB,
        winnerTeamId: winner,
        metadata: {
          ...match.metadata,
          games: dto.games,
          kind: dto.kind,
          reason: dto.reason ?? '',
          history,
        },
      });
      if (match.stage !== 'group') {
        const state = structuredClone(tournament.settings?.bracket_engine) as
          Database | undefined;
        if (state && match.metadata?.engine_id !== undefined) {
          const storage = new InMemoryDatabase();
          storage.setData(state);
          const engine = new BracketsManager(storage);
          try {
            await engine.update.match({
              id: Number(match.metadata.engine_id),
              opponent1: {
                score: winsA,
                result: winner === match.teamAId ? 'win' : 'loss',
              },
              opponent2: {
                score: winsB,
                result: winner === match.teamBId ? 'win' : 'loss',
              },
            });
          } catch {
            businessValidation(
              'result',
              'Engine không cho phép sửa kết quả đã khóa bởi vòng tiếp theo.',
            );
          }
          const updated = await engine.export();
          for (const fixture of fixtures.filter(
            (m) => m.stage !== 'group' && m.id !== match.id,
          )) {
            const engineMatch = updated.match.find(
              (m) => m.id === fixture.metadata?.engine_id,
            );
            if (!engineMatch) continue;
            await manager.update(TournamentMatch, fixture.id, {
              teamAId:
                updated.participant.find(
                  (p) => p.id === engineMatch.opponent1?.id,
                )?.name ?? null,
              teamBId:
                updated.participant.find(
                  (p) => p.id === engineMatch.opponent2?.id,
                )?.name ?? null,
            });
          }
          await manager.update(Tournament, tournament.id, {
            settings: { ...tournament.settings, bracket_engine: updated },
          });
        } else if (match.stage === 'semifinal') {
          const final = fixtures.find((m) => m.stage === 'final');
          if (final?.winnerTeamId)
            businessValidation('result', 'Chung kết đã có kết quả.');
          if (final)
            await manager.update(
              TournamentMatch,
              final.id,
              match.round === 'Bán kết 1'
                ? { teamAId: winner }
                : { teamBId: winner },
            );
        }
        if (
          match.stage === 'final' &&
          !fixtures.some((m) => m.stage === 'bronze' && !m.winnerTeamId)
        )
          await manager.update(Tournament, tournament.id, {
            status: 'completed',
          });
        if (
          match.stage === 'bronze' &&
          fixtures.some((m) => m.stage === 'final' && m.winnerTeamId)
        )
          await manager.update(Tournament, tournament.id, {
            status: 'completed',
          });
      }
    });
    return this.workspace(current.tournamentId);
  }

  async finalize(id: string, applyRating: boolean) {
    await this.mutate(
      id,
      async (manager, tournament) => {
        if (tournament.settings?.finalized) return;
        const matches = await manager.findBy(TournamentMatch, {
          tournamentId: id,
        });
        const final = matches.find((m) => m.stage === 'final');
        if (
          !final?.winnerTeamId ||
          matches.some((m) => m.stage !== 'group' && !m.winnerTeamId)
        )
          businessValidation(
            'result',
            'Cần hoàn tất nhánh và trận tranh hạng ba trước khi chốt giải.',
          );
        if (applyRating) {
          const teams = await manager.findBy(Team, { tournamentId: id });
          const playerIds = [
            ...new Set(
              teams
                .flatMap((t) => [t.playerOneId, t.playerTwoId])
                .filter((p): p is string => !!p),
            ),
          ].sort();
          for (const playerId of playerIds)
            await manager.findOneOrFail(Player, {
              where: { id: playerId },
              lock: { mode: 'pessimistic_write' },
            });
          const bronze = matches.find((m) => m.stage === 'bronze');
          const qualified = new Set(
            matches
              .filter((m) => m.stage !== 'group')
              .flatMap((m) => [m.teamAId, m.teamBId]),
          );
          const runnerUp =
            final.winnerTeamId === final.teamAId
              ? final.teamBId
              : final.teamAId;
          for (const team of teams) {
            const lostSemifinal = matches.some(
              (m) =>
                m.stage === 'semifinal' &&
                m.winnerTeamId &&
                m.winnerTeamId !== team.id &&
                [m.teamAId, m.teamBId].includes(team.id),
            );
            const delta =
              team.id === final.winnerTeamId
                ? 0.05
                : team.id === runnerUp
                  ? 0.03
                  : bronze
                    ? team.id === bronze.winnerTeamId
                      ? 0.02
                      : !qualified.has(team.id)
                        ? -0.02
                        : 0
                    : lostSemifinal
                      ? 0.02
                      : !qualified.has(team.id)
                        ? -0.02
                        : 0;
            for (const playerId of [team.playerOneId, team.playerTwoId].filter(
              (id): id is string => !!id,
            )) {
              const player = await manager.findOneOrFail(Player, {
                where: { id: playerId },
                lock: { mode: 'pessimistic_write' },
              });
              const rating = Math.min(
                6,
                Math.max(1, Number((player.rating + delta).toFixed(2))),
              );
              await manager.save(
                RatingAssessment,
                manager.create(RatingAssessment, {
                  playerId,
                  baseRating: player.rating,
                  bonus: rating - player.rating,
                  passedRules: [],
                  rating,
                  assessedAt: new Date(),
                  notes: `Điểm nội bộ giải ${tournament.name} (${id}): ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`,
                }),
              );
              await manager.update(Player, playerId, { rating });
            }
          }
        }
        await manager.update(Tournament, id, {
          status: 'completed',
          settings: {
            ...tournament.settings,
            finalized: true,
            rating_applied: applyRating,
            finalized_at: new Date().toISOString(),
          },
        });
      },
      true,
    );
    return this.workspace(id);
  }
}
