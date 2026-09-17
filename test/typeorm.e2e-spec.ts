import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DataType, newDb } from 'pg-mem';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DatabaseExceptionFilter } from '../src/common/database-exception.filter';
import { validationException } from '../src/common/validation';
import {
  AdminSession,
  databaseEntities,
  Player,
  TournamentMatch,
} from '../src/database/entities';

type Profile = {
  id: string;
  name: string;
  rating: string;
  gender: string;
  hand: string;
  avatar_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};
type Pair = {
  id: string;
  name: string;
  total_rating: string;
  player_one: Profile;
  player_two: Profile | null;
};
type Group = { id: string; name: string; teams: Pair[]; matches?: Match[] };
type Match = {
  id: string;
  stage: string;
  round: string;
  team_a_id: string | null;
  team_b_id: string | null;
  winner_team_id: string | null;
  scheduled_at: string | null;
  team_a: Pair | null;
  team_b: Pair | null;
};
type PublicPair = {
  id: string;
  total_rating: number;
  players: Array<{ id: string; rating: number; avatar_url: string | null }>;
};
type Detail = {
  summary: { raw_status: string; registered_teams: number };
  teams: PublicPair[];
  groups: Array<{
    id: string;
    standings: Array<{ wins: number; points: number }>;
  }>;
  bracket: Match[];
  progress: { percentage: number };
};
type Page<T> = { data: T[]; total: number; current_page: number };

describe('TypeORM API integration (isolated PostgreSQL emulator)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  let token = '';

  beforeEach(async () => {
    token = '';
    const memory = newDb({ autoCreateForeignKeyIndices: true });
    memory.public.registerFunction({
      name: 'current_database',
      returns: DataType.text,
      implementation: () => 'pickleball_test',
    });
    memory.public.registerFunction({
      name: 'version',
      returns: DataType.text,
      implementation: () => 'PostgreSQL 16.0',
    });
    db = memory.adapters.createTypeormDataSource({
      type: 'postgres',
      entities: databaseEntities,
      synchronize: true,
      installExtensions: false,
      invalidWhereValuesBehavior: { null: 'throw', undefined: 'throw' },
    }) as DataSource;
    await db.initialize();
    const config = new ConfigService({
      DATABASE_URL: 'postgresql://test:test@localhost/pickleball_test',
      ADMIN_USERNAME: 'integration-admin',
      ADMIN_PASSWORD: 'integration-password',
      ADMIN_SESSION_HOURS: 12,
      ADMIN_SESSION_TOUCH_MINUTES: 5,
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DataSource)
      .useValue(db)
      .overrideProvider(ConfigService)
      .useValue(config)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        exceptionFactory: validationException,
      }),
    );
    app.useGlobalFilters(new DatabaseExceptionFilter());
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
    if (db?.isInitialized) await db.destroy();
  });

  async function call<T>(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
    status: number,
    body?: Record<string, unknown>,
    authenticated = true,
  ): Promise<T> {
    const req = request(app.getHttpServer())[method](`/api${path}`);
    if (authenticated && token) req.set('Authorization', `Bearer ${token}`);
    if (body) req.send(body);
    const response = await req.expect(status);
    return response.body as T;
  }

  async function login() {
    const result = await call<{ token: string }>('post', '/admin/login', 201, {
      username: 'integration-admin',
      password: 'integration-password',
    });
    token = result.token;
  }

  async function player(index = 1) {
    return call<Profile>('post', '/players', 201, {
      name: `Player ${index}`,
      gender: index % 2 ? 'male' : 'female',
      avatar_url: `https://example.com/player-${index}.jpg`,
      rating: 2.5 + index / 10,
      hand: 'right',
      metadata: { club: 'Ocean Gym' },
    });
  }

  async function tournament(slug = 'integration-cup') {
    return call<{
      id: string;
      slug: string;
      settings: Record<string, unknown> | null;
    }>('post', '/tournaments', 201, {
      slug,
      name: 'Integration Cup',
      format: 'double',
      max_teams: 16,
      courts: 2,
      settings: { target: 11 },
    });
  }

  it('keeps public APIs unauthenticated and protects admin sessions', async () => {
    await call('get', '/public/home', 200, undefined, false);
    await call('get', '/public/players', 200, undefined, false);
    await call('get', '/public/schedule', 200, undefined, false);
    await call('get', '/players', 401);
    await call('get', '/admin/status', 401);
    await call('post', '/admin/login', 422, {
      username: 'integration-admin',
      password: 'wrong',
    });
    await login();
    await call('get', '/admin/status', 200);
    await call('post', '/admin/logout', 204);
    await call('get', '/admin/status', 401);
    await login();
    const sessions = await db.getRepository(AdminSession).find();
    await db
      .getRepository(AdminSession)
      .update(sessions[0].id, { expiresAt: new Date(Date.now() - 60000) });
    await call('get', '/admin/status', 401);
  });

  it('handles player CRUD, filters, pagination, decimals and nullable JSON', async () => {
    await login();
    const one = await player(1),
      two = await player(2);
    expect(one.rating).toBe('2.60');
    expect(one.created_at).toBeTruthy();
    const page = await call<Page<Profile>>(
      'get',
      '/players?search=player&gender=female&min_rating=2.7&sort=rating&per_page=1',
      200,
    );
    expect(page.total).toBe(1);
    expect(page.data[0].id).toBe(two.id);
    const updated = await call<Profile>('patch', `/players/${one.id}`, 200, {
      name: 'Updated Player',
      avatar_url: null,
      metadata: null,
      hand: 'left',
    });
    expect(updated).toMatchObject({
      name: 'Updated Player',
      avatar_url: null,
      metadata: null,
      hand: 'left',
      rating: '2.60',
    });
    const rating = await call<{
      player: Profile;
      assessment: { rating: string };
    }>('post', `/players/${one.id}/ratings`, 201, {
      base_rating: 2.5,
      passed_rules: ['serve_consistency'],
    });
    expect(rating.player.rating).toBe('2.75');
    expect(rating.assessment.rating).toBe('2.75');
    const ranked = await call<Page<{ id: string; rating: number }>>(
      'get',
      '/public/players?sort=rating',
      200,
      undefined,
      false,
    );
    expect(ranked.data[0]).toMatchObject({ id: one.id, rating: 2.75 });
    await call('delete', `/players/${one.id}`, 204);
    await call('get', `/players/${one.id}`, 404);
    await call('patch', `/players/${one.id}`, 404, { name: 'Missing' });
    await call('delete', `/players/${one.id}`, 404);
    expect(await db.getRepository(Player).count()).toBe(1);
  });

  it('handles tournament CRUD, relation counts, duplicate slugs and JSON clearing', async () => {
    await login();
    const cup = await tournament();
    await call('post', '/tournaments', 422, {
      slug: cup.slug,
      name: 'Duplicate',
      format: 'double',
      max_teams: 4,
    });
    const page = await call<
      Page<{
        id: string;
        teams_count: number;
        groups_count: number;
        matches_count: number;
      }>
    >('get', '/tournaments?search=integration&status=draft', 200);
    expect(page.data[0]).toMatchObject({
      id: cup.id,
      teams_count: 0,
      groups_count: 0,
      matches_count: 0,
    });
    const updated = await call<{ settings: null; starts_at: null }>(
      'put',
      `/tournaments/${cup.id}`,
      200,
      { settings: null, starts_at: null },
    );
    expect(updated.settings).toBeNull();
    expect(updated.starts_at).toBeNull();
    await call('get', `/tournaments/${cup.id}`, 200);
    await call('get', `/public/tournaments/${cup.slug}`, 200, undefined, false);
    await call('delete', `/tournaments/${cup.id}`, 204);
    await call('get', `/public/tournaments/${cup.slug}`, 404, undefined, false);
  });

  it('runs pairing, groups, round robin, semifinal and final with nested avatars', async () => {
    await login();
    const players: Profile[] = [];
    for (let index = 1; index <= 8; index++) players.push(await player(index));
    const cup = await tournament();
    const manual = await call<Pair>(
      'post',
      `/tournaments/${cup.id}/teams`,
      201,
      { player_one_id: players[0].id, player_two_id: players[1].id },
    );
    expect(manual.player_one.avatar_url).toBe(players[0].avatar_url);
    await call('patch', `/teams/${manual.id}`, 200, { name: 'Renamed pair' });
    await call('post', `/tournaments/${cup.id}/teams`, 422, {
      player_one_id: players[0].id,
      player_two_id: players[2].id,
    });
    await call('delete', `/teams/${manual.id}`, 204);
    const pairs = await call<Pair[]>(
      'post',
      `/tournaments/${cup.id}/teams/generate`,
      201,
      { player_ids: players.map((p) => p.id), balance: true, replace: true },
    );
    expect(pairs).toHaveLength(4);
    expect(pairs.every((pair) => Number(pair.total_rating) === 5.9)).toBe(true);
    const groups = await call<Group[]>(
      'post',
      `/tournaments/${cup.id}/groups/randomize`,
      201,
      { group_count: 2 },
    );
    expect(groups).toHaveLength(2);
    expect(
      groups.every(
        (group) =>
          group.teams.length === 2 && group.teams[0].player_one.avatar_url,
      ),
    ).toBeTruthy();
    const temp = await call<Group>(
      'post',
      `/tournaments/${cup.id}/groups`,
      201,
      { name: 'Temp', team_ids: [] },
    );
    const filled = await call<Group>('patch', `/groups/${temp.id}`, 200, {
      team_ids: [pairs[0].id],
    });
    expect(filled.teams).toHaveLength(1);
    const empty = await call<Group>('patch', `/groups/${temp.id}`, 200, {
      team_ids: [],
    });
    expect(empty.teams).toHaveLength(0);
    await call('delete', `/groups/${temp.id}`, 204);
    await call('post', `/tournaments/${cup.id}/brackets/generate`, 422, {});
    const matches: Match[] = [];
    for (const group of groups) {
      matches.push(
        ...(await call<Match[]>(
          'post',
          `/groups/${group.id}/matches/generate-round-robin`,
          201,
          {
            starts_at: '2026-10-01T08:00:00.000Z',
            court_count: 2,
            round_interval_minutes: 30,
          },
        )),
      );
      await call('get', `/groups/${group.id}`, 200);
    }
    expect(matches).toHaveLength(2);
    const listing = await call<Page<Match>>(
      'get',
      `/matches?tournament_id=${cup.id}&stage=group`,
      200,
    );
    expect(listing.total).toBe(2);
    await call('put', `/matches/${matches[0].id}`, 200, {
      court: 'Court 3',
      scheduled_at: null,
    });
    for (const match of matches)
      await call('post', `/matches/${match.id}/result`, 201, {
        score_a: 11,
        score_b: 7,
      });
    const bracket = await call<Match[]>(
      'post',
      `/tournaments/${cup.id}/brackets/generate`,
      201,
      {},
    );
    expect(bracket).toHaveLength(3);
    for (const match of bracket.filter((m) => m.stage === 'semifinal'))
      await call('post', `/matches/${match.id}/result`, 201, {
        score_a: 11,
        score_b: 8,
      });
    const populated = await call<Match[]>(
      'get',
      `/tournaments/${cup.id}/brackets`,
      200,
    );
    const final = populated.find((m) => m.stage === 'final')!;
    expect(final.team_a_id).toBeTruthy();
    expect(final.team_b_id).toBeTruthy();
    await call('post', `/matches/${final.id}/result`, 201, {
      score_a: 11,
      score_b: 9,
    });
    const detail = await call<Detail>(
      'get',
      `/public/tournaments/${cup.slug}`,
      200,
      undefined,
      false,
    );
    expect(detail.summary).toMatchObject({
      raw_status: 'completed',
      registered_teams: 4,
    });
    expect(detail.progress.percentage).toBe(100);
    expect(
      detail.teams[0].players.every(
        (p) => p.avatar_url && typeof p.rating === 'number',
      ),
    ).toBe(true);
    expect(detail.groups[0].standings[0].points).toBe(3);
    await call('get', '/public/home', 200, undefined, false);
    const schedule = await call<Array<{ team_a: PublicPair | null }>>(
      'get',
      '/public/schedule',
      200,
      undefined,
      false,
    );
    expect(schedule).toHaveLength(5);
    expect(schedule.some((match) => match.team_a?.players[0]?.avatar_url)).toBe(
      true,
    );
    await call('get', `/tournaments/${cup.id}`, 200);
    await call('post', `/matches/${matches[0].id}/result`, 201, {
      score_a: 5,
      score_b: 11,
    });
    expect(
      await call<Match[]>('get', `/tournaments/${cup.id}/brackets`, 200),
    ).toHaveLength(0);
    await call('delete', `/tournaments/${cup.id}`, 204);
    expect(await db.getRepository(TournamentMatch).count()).toBe(0);
  });

  it('keeps unpublished tournaments out of public home and schedule', async () => {
    await login();
    const cup = await tournament();
    await call('put', `/tournaments/${cup.id}`, 200, { slug: null });
    const home = await call<{ tournaments: unknown[] }>(
      'get',
      '/public/home',
      200,
      undefined,
      false,
    );
    expect(home.tournaments).toHaveLength(0);
    await call('get', '/public/schedule', 200, undefined, false);
  });
});
