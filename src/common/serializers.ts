/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
type RecordLike = Record<string, any>;

const iso = (value?: Date | null) => value?.toISOString() ?? null;
const decimal = (value: unknown) => Number(value ?? 0).toFixed(2);

export function playerResponse(player: RecordLike) {
  return {
    id: player.id,
    name: player.name,
    gender: player.gender,
    avatar_url: player.avatarUrl ?? null,
    rating: decimal(player.rating),
    hand: player.hand,
    metadata: player.metadata ?? null,
    created_at: iso(player.createdAt),
    updated_at: iso(player.updatedAt),
  };
}

export function publicPlayerResponse(player: RecordLike) {
  return {
    id: player.id,
    name: player.name,
    gender: player.gender,
    avatar_url: player.avatarUrl ?? null,
    rating: Number(player.rating),
    hand: player.hand,
  };
}

export function tournamentResponse(tournament: RecordLike) {
  return {
    id: tournament.id,
    slug: tournament.slug ?? null,
    name: tournament.name,
    format: tournament.format,
    status: tournament.status,
    category: tournament.category ?? null,
    location: tournament.location ?? null,
    description: tournament.description ?? null,
    cover_url: tournament.coverUrl ?? null,
    max_teams: tournament.maxTeams,
    starts_at: iso(tournament.startsAt),
    ends_at: iso(tournament.endsAt),
    courts: tournament.courts,
    settings: tournament.settings ?? null,
    created_at: iso(tournament.createdAt),
    updated_at: iso(tournament.updatedAt),
    ...(tournament.teamsCount !== undefined
      ? {
          teams_count: tournament.teamsCount,
          groups_count: tournament.groupsCount,
          matches_count: tournament.matchesCount,
        }
      : {}),
  };
}

export function teamResponse(
  team?: RecordLike | null,
): Record<string, unknown> | null {
  if (!team) return null;
  return {
    id: team.id,
    tournament_id: team.tournamentId,
    name: team.name,
    player_one_id: team.playerOneId,
    player_two_id: team.playerTwoId ?? null,
    total_rating: decimal(team.totalRating),
    seed: team.seed ?? null,
    created_at: iso(team.createdAt),
    updated_at: iso(team.updatedAt),
    ...(team.playerOne ? { player_one: playerResponse(team.playerOne) } : {}),
    ...(Object.prototype.hasOwnProperty.call(team, 'playerTwo')
      ? { player_two: team.playerTwo ? playerResponse(team.playerTwo) : null }
      : {}),
  };
}

export function publicTeamResponse(
  team?: RecordLike | null,
): Record<string, unknown> | null {
  if (!team) return null;
  return {
    id: team.id,
    name: team.name,
    total_rating: Number(team.totalRating),
    seed: team.seed ?? null,
    players: [team.playerOne, team.playerTwo]
      .filter(Boolean)
      .map(publicPlayerResponse),
  };
}

export function groupResponse(group: RecordLike) {
  const memberships = group.teams ?? [];
  return {
    id: group.id,
    tournament_id: group.tournamentId,
    name: group.name,
    sort_order: group.sortOrder,
    created_at: iso(group.createdAt),
    updated_at: iso(group.updatedAt),
    teams: memberships.map((membership: RecordLike) =>
      teamResponse(membership.team ?? membership),
    ),
    ...(group.matches ? { matches: group.matches.map(matchResponse) } : {}),
  };
}

export function matchResponse(match: RecordLike) {
  return {
    id: match.id,
    tournament_id: match.tournamentId,
    group_id: match.groupId ?? null,
    stage: match.stage,
    round: match.round,
    court: match.court ?? null,
    team_a_id: match.teamAId ?? null,
    team_b_id: match.teamBId ?? null,
    score_a: match.scoreA ?? null,
    score_b: match.scoreB ?? null,
    winner_team_id: match.winnerTeamId ?? null,
    metadata: match.metadata ?? null,
    scheduled_at: iso(match.scheduledAt),
    created_at: iso(match.createdAt),
    updated_at: iso(match.updatedAt),
    ...(Object.prototype.hasOwnProperty.call(match, 'teamA')
      ? { team_a: teamResponse(match.teamA) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(match, 'teamB')
      ? { team_b: teamResponse(match.teamB) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(match, 'group')
      ? {
          group: match.group
            ? { id: match.group.id, name: match.group.name }
            : null,
        }
      : {}),
  };
}

export function publicMatchResponse(match: RecordLike) {
  return {
    id: match.id,
    tournament_id: match.tournamentId,
    tournament_slug: match.tournament?.slug ?? null,
    tournament_name: match.tournament?.name ?? null,
    group_id: match.groupId ?? null,
    group_name: match.group?.name ?? null,
    stage: match.stage,
    round: match.round,
    court: match.court ?? null,
    scheduled_at: iso(match.scheduledAt),
    score_a: match.scoreA ?? null,
    score_b: match.scoreB ?? null,
    winner_team_id: match.winnerTeamId ?? null,
    games: match.metadata?.games ?? [],
    result_kind: match.metadata?.kind ?? null,
    round_number: match.metadata?.round_number ?? null,
    team_a: publicTeamResponse(match.teamA),
    team_b: publicTeamResponse(match.teamB),
  };
}

export function assessmentResponse(assessment: RecordLike) {
  return {
    id: assessment.id,
    player_id: assessment.playerId,
    base_rating: decimal(assessment.baseRating),
    passed_rules: assessment.passedRules,
    bonus: decimal(assessment.bonus),
    rating: decimal(assessment.rating),
    notes: assessment.notes ?? null,
    assessed_at: iso(assessment.assessedAt),
    created_at: iso(assessment.createdAt),
    updated_at: iso(assessment.updatedAt),
  };
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  perPage: number,
) {
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  return {
    current_page: page,
    data,
    first_page_url: null,
    from: total === 0 ? null : (page - 1) * perPage + 1,
    last_page: lastPage,
    last_page_url: null,
    next_page_url: page < lastPage ? String(page + 1) : null,
    path: null,
    per_page: perPage,
    prev_page_url: page > 1 ? String(page - 1) : null,
    to: total === 0 ? null : Math.min(page * perPage, total),
    total,
  };
}
