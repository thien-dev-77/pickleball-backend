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
import { UploadsService } from '../src/uploads/uploads.service';
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
  court: string | null;
  score_a: number | null;
  score_b: number | null;
  metadata: {
    kind?: string;
    round_number?: number;
    games?: Array<{ a: number; b: number }>;
  } | null;
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
type Workspace = {
  tournament: { id: string; status: string; settings: Record<string, unknown> };
  registrations: Array<{ player_id: string; status: string }>;
  teams: Pair[];
  groups: Group[];
  matches: Match[];
  progress: {
    unassigned: number;
    confirmed: number;
    roster_locked: boolean;
    rating_applied: boolean;
  };
};

describe('TypeORM API integration (isolated PostgreSQL emulator)', () => {
  let app: INestApplication<App>;
  let db: DataSource;
  let token = '';
  const upload = jest.fn();

  beforeEach(async () => {
    token = '';
    upload.mockReset().mockResolvedValue({
      url: 'https://test-project.supabase.co/storage/v1/object/public/pickleball-images/players/test.webp',
      path: 'players/test.webp',
      bucket: 'pickleball-images',
      size: 100,
    });
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
      .overrideProvider(UploadsService)
      .useValue({ image: upload })
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

  it('authenticates multipart image uploads and enforces purpose and payload limits', async () => {
    await request(app.getHttpServer())
      .post('/api/uploads/images')
      .field('purpose', 'players')
      .attach('file', Buffer.from('test'), 'image.png')
      .expect(401);
    expect(upload).not.toHaveBeenCalled();
    await login();
    await request(app.getHttpServer())
      .post('/api/uploads/images')
      .set('Authorization', `Bearer ${token}`)
      .field('purpose', 'players')
      .attach('file', Buffer.from('test'), 'image.png')
      .expect(201);
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        buffer: Buffer.from('test'),
        size: 4,
        mimetype: 'image/png',
      }),
      'players',
    );
    upload.mockClear();
    await request(app.getHttpServer())
      .post('/api/uploads/images')
      .set('Authorization', `Bearer ${token}`)
      .field('purpose', '../private')
      .attach('file', Buffer.from('test'), 'image.png')
      .expect(422);
    await request(app.getHttpServer())
      .post('/api/uploads/images')
      .set('Authorization', `Bearer ${token}`)
      .field('purpose', 'players')
      .attach('file', Buffer.alloc(3 * 1024 * 1024 + 1), 'image.png')
      .expect(413);
    expect(upload).not.toHaveBeenCalled();
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
    await call('post', `/tournaments/${cup.id}/registrations`, 201, {
      player_ids: players.map((p) => p.id),
      status: 'confirmed',
    });
    await call('post', `/tournaments/${cup.id}/roster-lock`, 201, {
      locked: true,
    });
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
    await call<Group>('patch', `/groups/${temp.id}`, 422, {
      team_ids: [pairs[0].id],
    });
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
    await call('post', `/matches/${matches[0].id}/result`, 422, {
      score_a: 5,
      score_b: 11,
    });
    expect(
      await call<Match[]>('get', `/tournaments/${cup.id}/brackets`, 200),
    ).toHaveLength(3);
    await call('delete', `/tournaments/${cup.id}`, 422);
    expect(await db.getRepository(TournamentMatch).count()).toBe(5);
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

  async function preparedSingle(count = 6, groupCount = 2) {
    const profiles: Profile[] = [];
    for (let i = 1; i <= count; i++) profiles.push(await player(i));
    const cup = await call<{ id: string; slug: string }>(
      'post',
      '/tournaments',
      201,
      { name: 'Singles Cup', format: 'single', max_teams: count, courts: 2 },
    );
    await call('post', `/tournaments/${cup.id}/registrations`, 201, {
      player_ids: profiles.map((p) => p.id),
      status: 'confirmed',
    });
    await call('post', `/tournaments/${cup.id}/roster-lock`, 201, {
      locked: true,
    });
    const entries = await call<Workspace>(
      'post',
      `/tournaments/${cup.id}/entries/generate`,
      201,
      {},
    );
    expect(entries.teams).toHaveLength(count);
    expect(entries.teams.every((t) => t.player_two === null)).toBe(true);
    await call('post', `/tournaments/${cup.id}/draw`, 201, {
      group_count: groupCount,
      mode: 'seeded',
    });
    const scheduled = await call<Workspace>(
      'post',
      `/tournaments/${cup.id}/schedule`,
      201,
      {
        starts_at: '2026-10-01T08:00:00.000Z',
        court_count: 2,
        slot_minutes: 30,
        rest_minutes: 10,
      },
    );
    return { cup, profiles, scheduled };
  }

  it('requires explicit tournament registration, confirmation and roster lock', async () => {
    await login();
    const profiles = [
      await player(1),
      await player(2),
      await player(3),
      await player(4),
    ];
    const cup = await tournament();
    await call('post', `/tournaments/${cup.id}/teams/generate`, 422, {
      player_ids: profiles.map((p) => p.id),
    });
    await call('post', `/tournaments/${cup.id}/registrations`, 201, {
      player_ids: profiles.map((p) => p.id),
    });
    await call('post', `/tournaments/${cup.id}/roster-lock`, 422, {
      locked: true,
    });
    for (const p of profiles)
      await call('patch', `/tournaments/${cup.id}/registrations/${p.id}`, 200, {
        status: 'confirmed',
      });
    await call('post', `/tournaments/${cup.id}/roster-lock`, 201, {
      locked: true,
    });
    await call(
      'patch',
      `/tournaments/${cup.id}/registrations/${profiles[0].id}`,
      422,
      { status: 'withdrawn' },
    );
    const outsider = await player(5);
    await call('post', `/tournaments/${cup.id}/teams`, 422, {
      player_one_id: profiles[0].id,
      player_two_id: outsider.id,
    });
    const manual = await call<Pair>(
      'post',
      `/tournaments/${cup.id}/teams`,
      201,
      { player_one_id: profiles[0].id, player_two_id: profiles[1].id },
    );
    await call('patch', `/teams/${manual.id}`, 200, {
      player_two_id: profiles[2].id,
    });
    await call('delete', `/players/${profiles[0].id}`, 422);
    const workspace = await call<Workspace>(
      'get',
      `/tournaments/${cup.id}/workspace`,
      200,
    );
    expect(workspace.progress.unassigned).toBe(2);
    await call(
      'get',
      `/tournaments/${cup.id}/workspace`,
      401,
      undefined,
      false,
    );
  });

  it('supports odd-sized singles pools and avoids court and participant overlaps', async () => {
    await login();
    const { scheduled, cup } = await preparedSingle(5, 1);
    expect(scheduled.matches).toHaveLength(10);
    for (const [i, a] of scheduled.matches.entries())
      for (const b of scheduled.matches.slice(i + 1)) {
        const delta =
          Math.abs(
            new Date(a.scheduled_at!).getTime() -
              new Date(b.scheduled_at!).getTime(),
          ) / 60000;
        if (a.court === b.court) expect(delta).toBeGreaterThanOrEqual(30);
        if (
          [a.team_a_id, a.team_b_id].some((id) =>
            [b.team_a_id, b.team_b_id].includes(id),
          )
        )
          expect(delta).toBeGreaterThanOrEqual(40);
      }
    await call('post', `/tournaments/${cup.id}/playoff`, 422, {
      qualifiers_per_group: 2,
    });
    const m = scheduled.matches[0];
    await call('post', `/matches/${m.id}/score`, 422, {
      games: [{ a: 11, b: 10 }],
    });
    await call('post', `/matches/${m.id}/score`, 422, {
      games: [{ a: 8, b: 6 }],
    });
    await call('post', `/matches/${m.id}/score`, 422, {
      games: [{ a: 15, b: 7 }],
    });
    await call('post', `/matches/${m.id}/score`, 201, {
      games: [{ a: 12, b: 10 }],
    });
    await call('post', `/tournaments/${cup.id}/draw`, 422, {
      group_count: 1,
      replace: true,
    });
    await call('post', `/tournaments/${cup.id}/schedule`, 422, {
      starts_at: '2026-10-01T08:00:00Z',
      replace: true,
    });
    await call('post', `/tournaments/${cup.id}/entries/generate`, 422, {
      replace: true,
    });
  });

  it('validates mixed doubles, rating eligibility and registration capacity', async () => {
    await login();
    const profiles = [
      await player(1),
      await player(2),
      await player(3),
      await player(4),
    ];
    const cup = await call<{ id: string }>('post', '/tournaments', 201, {
      name: 'Mixed Cup',
      format: 'double',
      max_teams: 2,
    });
    await call('patch', `/tournaments/${cup.id}/competition-settings`, 200, {
      division: 'mixed',
      max_rating: 3,
      max_team_rating: 6,
    });
    const outsider = await player(8);
    await call('post', `/tournaments/${cup.id}/registrations`, 422, {
      player_ids: [outsider.id],
      status: 'confirmed',
    });
    await call('post', `/tournaments/${cup.id}/registrations`, 201, {
      player_ids: profiles.map((p) => p.id),
      status: 'confirmed',
    });
    const overflow = await player(5);
    await call('post', `/tournaments/${cup.id}/registrations`, 422, {
      player_ids: [overflow.id],
    });
    await call('post', `/tournaments/${cup.id}/roster-lock`, 201, {
      locked: true,
    });
    await call('post', `/tournaments/${cup.id}/teams`, 422, {
      player_one_id: profiles[0].id,
      player_two_id: profiles[2].id,
    });
    const generated = await call<Workspace>(
      'post',
      `/tournaments/${cup.id}/entries/generate`,
      201,
      {},
    );
    expect(
      generated.teams.every(
        (t) => t.player_one.gender !== t.player_two?.gender,
      ),
    ).toBe(true);
    await call('patch', `/tournaments/${cup.id}`, 422, { format: 'single' });
  });

  it('supports best-of-three games, walkovers and audited corrections', async () => {
    await login();
    const profiles = [await player(1), await player(2)];
    const cup = await call<{ id: string }>('post', '/tournaments', 201, {
      name: 'Game Cup',
      format: 'single',
      max_teams: 2,
    });
    await call('patch', `/tournaments/${cup.id}/competition-settings`, 200, {
      group_best_of: 3,
    });
    await call('post', `/tournaments/${cup.id}/registrations`, 201, {
      player_ids: profiles.map((p) => p.id),
      status: 'confirmed',
    });
    await call('post', `/tournaments/${cup.id}/roster-lock`, 201, {
      locked: true,
    });
    await call('post', `/tournaments/${cup.id}/entries/generate`, 201, {});
    await call('post', `/tournaments/${cup.id}/draw`, 201, { group_count: 1 });
    const scheduled = await call<Workspace>(
      'post',
      `/tournaments/${cup.id}/schedule`,
      201,
      { starts_at: '2026-10-01T08:00:00Z' },
    );
    const m = scheduled.matches[0];
    await call('post', `/matches/${m.id}/score`, 422, {
      games: [{ a: 11, b: 7 }],
    });
    await call('post', `/matches/${m.id}/score`, 422, {
      games: [
        { a: 11, b: 7 },
        { a: 11, b: 7 },
        { a: 7, b: 11 },
      ],
    });
    const scored = await call<Workspace>(
      'post',
      `/matches/${m.id}/score`,
      201,
      {
        games: [
          { a: 11, b: 9 },
          { a: 0, b: 11 },
          { a: 11, b: 9 },
        ],
      },
    );
    expect(scored.matches[0].winner_team_id).toBe(m.team_a_id);
    expect(scored.matches[0].score_a).toBeLessThan(scored.matches[0].score_b!);
    await call('post', `/matches/${m.id}/score`, 422, {
      kind: 'walkover',
      winner_team_id: m.team_b_id,
    });
    const corrected = await call<Workspace>(
      'post',
      `/matches/${m.id}/score`,
      201,
      {
        kind: 'walkover',
        winner_team_id: m.team_b_id,
        reason: 'Official correction',
      },
    );
    expect(corrected.matches[0].winner_team_id).toBe(m.team_b_id);
    expect(corrected.matches[0].metadata?.kind).toBe('walkover');
  });

  it('supports manual pool moves and resolves tied qualification consistently in public views', async () => {
    await login();
    const profiles: Profile[] = [];
    for (let i = 1; i <= 6; i++) profiles.push(await player(i));
    const cup = await call<{ id: string; slug: string }>(
      'post',
      '/tournaments',
      201,
      { name: 'Tied Pools', format: 'single', max_teams: 6 },
    );
    await call('post', `/tournaments/${cup.id}/registrations`, 201, {
      player_ids: profiles.map((p) => p.id),
      status: 'confirmed',
    });
    await call('patch', `/tournaments/${cup.id}`, 422, { max_teams: 4 });
    await call('post', `/tournaments/${cup.id}/roster-lock`, 201, {
      locked: true,
    });
    await call('patch', `/players/${profiles[0].id}`, 422, { rating: 4 });
    await call('patch', `/tournaments/${cup.id}/competition-settings`, 422, {
      group_target: 15,
    });
    await call('post', `/tournaments/${cup.id}/entries/generate`, 201, {});
    const drawn = await call<Workspace>(
      'post',
      `/tournaments/${cup.id}/draw`,
      201,
      { group_count: 2, mode: 'seeded' },
    );
    const [a, b] = drawn.groups;
    await call('post', `/tournaments/${cup.id}/group-assignment`, 201, {
      team_id: a.teams[0].id,
      group_id: b.id,
    });
    await call('post', `/tournaments/${cup.id}/group-assignment`, 201, {
      team_id: b.teams[0].id,
      group_id: a.id,
    });
    const scheduled = await call<Workspace>(
      'post',
      `/tournaments/${cup.id}/schedule`,
      201,
      { starts_at: '2026-10-01T08:00:00.000Z' },
    );
    await call('post', `/tournaments/${cup.id}/group-assignment`, 422, {
      team_id: a.teams[0].id,
      group_id: a.id,
    });
    const samePlayerMatch = scheduled.matches.find(
      (m) =>
        m.id !== scheduled.matches[0].id &&
        [m.team_a_id, m.team_b_id].includes(scheduled.matches[0].team_a_id),
    )!;
    await call('patch', `/matches/${samePlayerMatch.id}`, 422, {
      court: null,
      scheduled_at: scheduled.matches[0].scheduled_at,
    });
    for (const pool of scheduled.groups) {
      const ids = pool.teams.map((t) => t.id);
      for (const m of scheduled.matches.filter(
        (m) => ids.includes(m.team_a_id!) && ids.includes(m.team_b_id!),
      )) {
        const aWins =
          ids.indexOf(m.team_a_id!) === (ids.indexOf(m.team_b_id!) + 1) % 3;
        await call('post', `/matches/${m.id}/score`, 201, {
          games: [{ a: aWins ? 11 : 9, b: aWins ? 9 : 11 }],
        });
      }
    }
    await call('post', `/tournaments/${cup.id}/playoff`, 422, {
      qualifiers_per_group: 2,
    });
    for (const pool of scheduled.groups) {
      await call('post', `/tournaments/${cup.id}/tie-break`, 422, {
        group_id: pool.id,
        team_ids: pool.teams.map((t) => t.id),
        reason: ' ',
      });
      await call('post', `/tournaments/${cup.id}/tie-break`, 201, {
        group_id: pool.id,
        team_ids: pool.teams.map((t) => t.id).reverse(),
        reason: 'Biên bản bốc thăm đồng hạng',
      });
    }
    const detail = await call<{
      groups: Array<{ id: string; standings: Array<{ team: { id: string } }> }>;
    }>('get', `/public/tournaments/${cup.slug}`, 200, undefined, false);
    for (const pool of scheduled.groups)
      expect(
        detail.groups
          .find((g) => g.id === pool.id)!
          .standings.map((r) => r.team.id),
      ).toEqual(pool.teams.map((t) => t.id).reverse());
    await call('post', `/tournaments/${cup.id}/playoff`, 201, {
      qualifiers_per_group: 2,
    });
    await call('delete', `/tournaments/${cup.id}/playoff`, 200);
    const reset = await call<Workspace>(
      'get',
      `/tournaments/${cup.id}/workspace`,
      200,
    );
    expect(
      reset.matches.every((m) => m.stage === 'group' && m.winner_team_id),
    ).toBe(true);
    await call('post', `/tournaments/${cup.id}/playoff`, 201, {
      qualifiers_per_group: 2,
    });
    await call('post', `/tournaments/${cup.id}/tie-break`, 422, {
      group_id: a.id,
      team_ids: a.teams.map((t) => t.id),
      reason: 'Late change',
    });
  });

  it('creates larger knockout brackets with byes and finalizes rating only once', async () => {
    await login();
    const { cup, scheduled, profiles } = await preparedSingle(9, 3);
    for (const m of scheduled.matches) {
      const aWins =
        Number(m.team_a!.player_one.rating) >
        Number(m.team_b!.player_one.rating);
      await call('post', `/matches/${m.id}/score`, 201, {
        games: [{ a: aWins ? 11 : 7, b: aWins ? 7 : 11 }],
      });
    }
    let workspace = await call<Workspace>(
      'post',
      `/tournaments/${cup.id}/playoff`,
      201,
      { qualifiers_per_group: 2, consolation_final: true },
    );
    expect(workspace.matches.filter((m) => m.stage !== 'group')).toHaveLength(
      8,
    );
    expect(workspace.matches.some((m) => m.metadata?.kind === 'bye')).toBe(
      true,
    );
    await call('post', `/matches/${scheduled.matches[0].id}/score`, 422, {
      games: [{ a: 7, b: 11 }],
      reason: 'Cannot alter closed pools',
    });
    for (let round = 0; round < 5; round++) {
      const ready = workspace.matches.filter(
        (m) =>
          m.stage !== 'group' &&
          m.team_a_id &&
          m.team_b_id &&
          !m.winner_team_id,
      );
      for (const m of ready)
        workspace = await call<Workspace>(
          'post',
          `/matches/${m.id}/score`,
          201,
          { games: [{ a: 11, b: 7 }] },
        );
    }
    expect(
      workspace.matches
        .filter((m) => m.stage !== 'group')
        .every((m) => m.winner_team_id),
    ).toBe(true);
    const final = workspace.matches.find((m) => m.stage === 'final')!;
    const completedDetail = await call<Detail>(
      'get',
      `/public/tournaments/${cup.slug}`,
      200,
      undefined,
      false,
    );
    expect(completedDetail.progress.percentage).toBe(100);
    await call('post', `/tournaments/${cup.id}/playoff`, 422, {
      qualifiers_per_group: 2,
      replace: true,
    });
    await call('post', `/tournaments/${cup.id}/finalize`, 201, {
      apply_rating: true,
    });
    const ratings = await db
      .getRepository(Player)
      .find({ order: { id: 'ASC' } });
    await call('post', `/tournaments/${cup.id}/finalize`, 201, {
      apply_rating: true,
    });
    expect(
      await db.getRepository(Player).find({ order: { id: 'ASC' } }),
    ).toEqual(ratings);
    const winner = workspace.teams.find((t) => t.id === final.winner_team_id)!;
    const original = profiles.find((p) => p.id === winner.player_one.id)!;
    expect(
      (await db.getRepository(Player).findOneByOrFail({ id: original.id }))
        .rating,
    ).toBeCloseTo(Number(original.rating) + 0.05);
    await call('post', `/matches/${final.id}/score`, 422, {
      games: [{ a: 7, b: 11 }],
      reason: 'Finalized',
    });
    await call('delete', `/tournaments/${cup.id}/playoff`, 422);
    await call('patch', `/tournaments/${cup.id}`, 422, {
      name: 'Changed finalized cup',
    });
  });
});
