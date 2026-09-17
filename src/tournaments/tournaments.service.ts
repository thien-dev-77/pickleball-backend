import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { DeepPartial } from 'typeorm';
import {
  Team,
  Tournament,
  TournamentGroup,
  TournamentMatch,
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
  constructor(private readonly db: DataSource) {}

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
    const repo = this.db.getRepository(Tournament);
    const item = await repo.findOneByOrFail({ id });
    return tournamentResponse(
      await repo.save(repo.merge(item, this.data(dto))),
    );
  }

  async remove(id: string) {
    const repo = this.db.getRepository(Tournament);
    await repo.delete((await repo.findOneByOrFail({ id })).id);
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
