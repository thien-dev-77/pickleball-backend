const baseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:8001/api';
if (process.env.ALLOW_SMOKE_MUTATIONS !== '1') throw new Error('This script creates persistent tournament history. Use only a disposable test database and set ALLOW_SMOKE_MUTATIONS=1.');
const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD || 'admin123456';
const runId = Date.now().toString(36);
let token = '';
let tournamentId = '';
const playerIds = [];

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  }
  return payload;
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });

try {
  const login = await request('/admin/login', json('POST', { username, password }));
  token = login.token;
  await request('/admin/status');
  await request('/ratings/calculate', json('POST', {
    base_rating: 2.75,
    passed_rules: ['serve_consistency', 'kitchen_control'],
  }));

  for (let index = 1; index <= 8; index++) {
    const player = await request('/players', json('POST', {
      name: `Smoke ${runId} Player ${index}`,
      gender: index % 2 ? 'male' : 'female',
      avatar_url: null,
      rating: 2.5 + index * 0.1,
      hand: index % 2 ? 'right' : 'left',
    }));
    playerIds.push(player.id);
  }
  await request(`/players/${playerIds[0]}`, json('PUT', { hand: 'left' }));
  await request(`/players/${playerIds[0]}/ratings`, json('POST', {
    base_rating: 2.5,
    passed_rules: ['serve_consistency'],
    notes: 'Automated smoke test',
  }));

  const tournament = await request('/tournaments', json('POST', {
    slug: `smoke-${runId}`,
    name: `Smoke Tournament ${runId}`,
    format: 'double',
    status: 'draft',
    category: 'Smoke test',
    location: 'Local',
    max_teams: 4,
    courts: 2,
  }));
  tournamentId = tournament.id;
  await request(`/tournaments/${tournamentId}`, json('PUT', { description: 'Temporary integration test' }));
  await request(`/tournaments/${tournamentId}`);
  await request(`/public/tournaments/smoke-${runId}`);
  await request(`/tournaments/${tournamentId}/registrations`, json('POST', { player_ids: playerIds, status: 'confirmed' }));
  await request(`/tournaments/${tournamentId}/roster-lock`, json('POST', { locked: true }));

  const temporaryTeam = await request(`/tournaments/${tournamentId}/teams`, json('POST', {
    player_one_id: playerIds[0],
    player_two_id: playerIds[1],
  }));
  await request(`/teams/${temporaryTeam.id}`, json('PATCH', { name: 'Temporary team' }));
  await request(`/teams/${temporaryTeam.id}`, { method: 'DELETE' });

  const teams = await request(`/tournaments/${tournamentId}/teams/generate`, json('POST', {
    player_ids: playerIds,
    balance: true,
    replace: true,
  }));
  await request(`/teams/${teams[0].id}`);
  await request(`/teams/${teams[0].id}`, json('PATCH', { seed: 1 }));

  const groups = await request(`/tournaments/${tournamentId}/groups/randomize`, json('POST', { group_count: 2 }));
  const temporaryGroup = await request(`/tournaments/${tournamentId}/groups`, json('POST', {
    name: 'Temporary group',
    team_ids: [],
  }));
  await request(`/groups/${temporaryGroup.id}`, { method: 'DELETE' });
  await request(`/groups/${groups[0].id}`, json('PATCH', { name: groups[0].name }));

  const groupMatches = [];
  for (const group of groups) {
    const matches = await request(`/groups/${group.id}/matches/generate-round-robin`, json('POST', {
      starts_at: new Date(Date.now() + 3_600_000).toISOString(),
      round_interval_minutes: 30,
      court_count: 2,
    }));
    groupMatches.push(...matches);
  }
  await request(`/matches/${groupMatches[0].id}`, json('PUT', { court: 'Smoke court' }));
  for (const match of groupMatches) {
    await request(`/matches/${match.id}/result`, json('POST', { score_a: 11, score_b: 7 }));
  }

  let bracket = await request(`/tournaments/${tournamentId}/brackets/generate`, json('POST', {}));
  const semifinals = bracket.filter((match) => match.stage === 'semifinal');
  for (const semifinal of semifinals) {
    await request(`/matches/${semifinal.id}/result`, json('POST', { score_a: 11, score_b: 8 }));
  }
  bracket = await request(`/tournaments/${tournamentId}/brackets`);
  const final = bracket.find((match) => match.stage === 'final');
  await request(`/matches/${final.id}/result`, json('POST', { score_a: 11, score_b: 9 }));

  const completed = await request(`/public/tournaments/smoke-${runId}`);
  console.log(JSON.stringify({
    players: playerIds.length,
    teams: teams.length,
    groups: groups.length,
    group_matches: groupMatches.length,
    bracket_matches: bracket.length,
    status: completed.summary.raw_status,
  }, null, 2));
} finally {
  if (token && tournamentId) {
    await request(`/tournaments/${tournamentId}`, { method: 'DELETE' }).catch(() => undefined);
  }
  if (token) {
    for (const playerId of playerIds) {
      await request(`/players/${playerId}`, { method: 'DELETE' }).catch(() => undefined);
    }
    await request('/admin/logout', { method: 'POST' }).catch(() => undefined);
  }
}
