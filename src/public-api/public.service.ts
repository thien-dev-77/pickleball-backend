import { Injectable } from '@nestjs/common';
import { DataSource, ILike, IsNull, Not, Raw } from 'typeorm';
import { rankGroup } from '../competition/standings';
import type { FindOptionsWhere } from 'typeorm';
import {
  Player,
  Team,
  Tournament,
  TournamentGroup,
  TournamentMatch,
} from '../database/entities';
import {
  groupRelations,
  publicMatchRelations,
  teamRelations,
} from '../database/relations';
import {
  paginate,
  publicMatchResponse,
  publicPlayerResponse,
  publicTeamResponse,
} from '../common/serializers';
import { PublicPlayersQueryDto } from './public.dto';

@Injectable()
export class PublicService {
  constructor(private readonly db: DataSource) {}

  async home() {
    const [tournaments, upcomingMatches, topPlayers] = await Promise.all([
      this.db
        .getRepository(Tournament)
        .createQueryBuilder('tournament')
        .where('tournament.slug IS NOT NULL')
        .loadRelationCountAndMap('tournament.teamsCount', 'tournament.teams')
        .getMany(),
      this.db.getRepository(TournamentMatch).find({
        where: {
          scoreA: IsNull(),
          scheduledAt: Not(IsNull()),
          tournament: {
            slug: Not(IsNull()),
            settings: Raw(
              (alias) =>
                `COALESCE(${alias
                  .split('.')
                  .map((part) => this.db.driver.escape(part))
                  .join('.')}->>'operation_status', 'active') = 'active'`,
            ),
          },
        },
        relations: publicMatchRelations,
        order: { scheduledAt: 'ASC' },
        take: 6,
      }),
      this.db
        .getRepository(Player)
        .find({ order: { rating: 'DESC', name: 'ASC' }, take: 8 }),
    ]);
    const statusOrder: Record<string, number> = {
      group: 1,
      knockout: 1,
      draft: 2,
      completed: 3,
    };
    tournaments.sort((left, right) => {
      const status =
        (statusOrder[left.status] ?? 4) - (statusOrder[right.status] ?? 4);
      if (status) return status;
      if (!left.startsAt && right.startsAt) return 1;
      if (left.startsAt && !right.startsAt) return -1;
      return (left.startsAt?.getTime() ?? 0) - (right.startsAt?.getTime() ?? 0);
    });
    return {
      tournaments: tournaments.map((item) => this.summary(item)),
      upcoming_matches: upcomingMatches.map(publicMatchResponse),
      top_players: topPlayers.map(publicPlayerResponse),
    };
  }

  async schedule() {
    return (
      await this.db.getRepository(TournamentMatch).find({
        where: { tournament: { slug: Not(IsNull()) } },
        relations: publicMatchRelations,
        order: {
          scheduledAt: { direction: 'ASC', nulls: 'LAST' },
          createdAt: 'ASC',
        },
        take: 100,
      })
    ).map(publicMatchResponse);
  }

  async players(query: PublicPlayersQueryDto) {
    const where: FindOptionsWhere<Player> = {
      ...(query.search ? { name: ILike(`%${query.search}%`) } : {}),
      ...(query.gender ? { gender: query.gender } : {}),
    };
    const [players, total] = await this.db.getRepository(Player).findAndCount({
      where,
      order:
        query.sort === 'rating'
          ? { rating: 'DESC', name: 'ASC' }
          : { name: 'ASC' },
      skip: (query.page - 1) * query.per_page,
      take: query.per_page,
    });
    return paginate(
      players.map(publicPlayerResponse),
      total,
      query.page,
      query.per_page,
    );
  }

  async show(slug: string) {
    const tournament = await this.db
      .getRepository(Tournament)
      .findOneByOrFail({ slug });
    // Load independent collections in parallel to avoid a teams x groups x matches join.
    [tournament.teams, tournament.groups, tournament.matches] =
      await Promise.all([
        this.db.getRepository(Team).find({
          where: { tournamentId: tournament.id },
          relations: teamRelations,
          order: { seed: { direction: 'ASC', nulls: 'LAST' } },
        }),
        this.db.getRepository(TournamentGroup).find({
          where: { tournamentId: tournament.id },
          relations: groupRelations,
          order: { sortOrder: 'ASC', teams: { position: 'ASC' } },
        }),
        this.db.getRepository(TournamentMatch).find({
          where: { tournamentId: tournament.id },
          relations: publicMatchRelations,
          order: {
            scheduledAt: { direction: 'ASC', nulls: 'LAST' },
            createdAt: 'ASC',
          },
        }),
      ]);
    const completedMatches = tournament.matches.filter(
      (match) => match.winnerTeamId && match.metadata?.kind !== 'bye',
    ).length;
    const playableMatches = tournament.matches.filter(
      (match) => match.metadata?.kind !== 'bye',
    ).length;
    const groups = tournament.groups.map((group) => {
      const matches = tournament.matches.filter(
        (match) => match.groupId === group.id,
      );
      const teams = group.teams.map((membership) => membership.team);
      return {
        id: group.id,
        name: group.name,
        sort_order: group.sortOrder,
        teams: teams.map(publicTeamResponse),
        standings: this.standings(
          teams,
          matches,
          (
            tournament.settings?.tie_breaks as
              Record<string, { order?: string[] }> | undefined
          )?.[group.id]?.order ?? [],
        ),
        matches: matches.map(publicMatchResponse),
      };
    });
    return {
      summary: this.summary(tournament),
      description: tournament.description,
      teams: tournament.teams.map(publicTeamResponse),
      groups,
      matches: tournament.matches.map(publicMatchResponse),
      bracket: tournament.matches
        .filter((match) => match.stage !== 'group')
        .sort(
          (left, right) =>
            Number(
              left.metadata?.round_number ??
                (left.stage === 'semifinal' ? 1 : 2),
            ) -
              Number(
                right.metadata?.round_number ??
                  (right.stage === 'semifinal' ? 1 : 2),
              ) || left.round.localeCompare(right.round),
        )
        .map(publicMatchResponse),
      progress: {
        completed_matches: completedMatches,
        total_matches: playableMatches,
        percentage: playableMatches
          ? Math.round((completedMatches / playableMatches) * 100)
          : 0,
      },
    };
  }

  private summary(tournament: Tournament) {
    const operation = tournament.settings?.operation_status;
    const status =
      operation === 'paused' || operation === 'cancelled'
        ? operation
        : tournament.status === 'completed'
          ? 'completed'
          : ['group', 'knockout'].includes(tournament.status)
            ? 'live'
            : 'upcoming';
    return {
      id: tournament.id,
      slug: tournament.slug,
      name: tournament.name,
      format: tournament.format,
      format_label:
        tournament.category || (tournament.format === 'double' ? 'Đôi' : 'Đơn'),
      status,
      status_label:
        status === 'paused'
          ? 'Tạm ngừng'
          : status === 'cancelled'
            ? 'Đã hủy'
            : status === 'live'
              ? 'Đang diễn ra'
              : status === 'completed'
                ? 'Đã kết thúc'
                : 'Sắp diễn ra',
      raw_status: tournament.status,
      operation_reason: tournament.settings?.operation_reason ?? null,
      location: tournament.location || 'Ocean Gym Pickleball',
      description: tournament.description,
      date_label: this.dateLabel(tournament.startsAt, tournament.endsAt),
      registered_teams: tournament.teamsCount ?? tournament.teams?.length ?? 0,
      max_teams: tournament.maxTeams,
      courts: tournament.courts,
      cover_url: tournament.coverUrl || '/images/pickleball-hero.jpg',
      starts_at: tournament.startsAt?.toISOString() ?? null,
      ends_at: tournament.endsAt?.toISOString() ?? null,
    };
  }

  private standings(
    teams: Team[],
    matches: TournamentMatch[],
    tieOrder: string[] = [],
  ) {
    return rankGroup(teams, matches, tieOrder).map((row) => ({
      ...row,
      team: publicTeamResponse(row.team),
    }));
  }

  private dateLabel(start?: Date | null, end?: Date | null) {
    if (!start) return 'Chưa công bố';
    const sameDay =
      end &&
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth() &&
      start.getDate() === end.getDate();
    if (!end || sameDay)
      return `${start.getDate()} tháng ${start.getMonth() + 1}, ${start.getFullYear()}`;
    if (
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth()
    )
      return `${start.getDate()} - ${end.getDate()} tháng ${start.getMonth() + 1}, ${start.getFullYear()}`;
    return `${start.getDate()} tháng ${start.getMonth() + 1} - ${end.getDate()} tháng ${end.getMonth() + 1}, ${start.getFullYear()}`;
  }
}
