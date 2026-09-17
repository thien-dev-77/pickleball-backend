import { Team, TournamentMatch } from '../database/entities';

export function rankGroup(
  teams: Team[],
  matches: TournamentMatch[],
  tieOrder: string[] = [],
) {
  const rows = teams.map((team) => {
    const played = matches.filter(
      (m) => m.winnerTeamId && (m.teamAId === team.id || m.teamBId === team.id),
    );
    const wins = played.filter((m) => m.winnerTeamId === team.id).length;
    const pointsFor = played.reduce(
      (sum, m) =>
        sum + (m.teamAId === team.id ? (m.scoreA ?? 0) : (m.scoreB ?? 0)),
      0,
    );
    const pointsAgainst = played.reduce(
      (sum, m) =>
        sum + (m.teamAId === team.id ? (m.scoreB ?? 0) : (m.scoreA ?? 0)),
      0,
    );
    return {
      team,
      played: played.length,
      wins,
      losses: played.length - wins,
      points_for: pointsFor,
      points_against: pointsAgainst,
      diff: pointsFor - pointsAgainst,
      points: wins * 3,
      head_to_head: 0,
      tied: false,
    };
  });
  for (const row of rows) {
    const tiedIds = rows
      .filter((r) => r.wins === row.wins)
      .map((r) => r.team.id);
    row.head_to_head = matches.filter(
      (m) =>
        m.winnerTeamId === row.team.id &&
        tiedIds.includes(m.teamAId ?? '') &&
        tiedIds.includes(m.teamBId ?? ''),
    ).length;
  }
  const compare = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    b.wins - a.wins ||
    b.head_to_head - a.head_to_head ||
    b.diff - a.diff ||
    b.points_for - a.points_for ||
    (tieOrder.includes(a.team.id) && tieOrder.includes(b.team.id)
      ? tieOrder.indexOf(a.team.id) - tieOrder.indexOf(b.team.id)
      : 0);
  rows.sort(compare);
  rows.forEach((row, i) => {
    row.tied = !!(
      (i > 0 && compare(row, rows[i - 1]) === 0) ||
      (i + 1 < rows.length && compare(row, rows[i + 1]) === 0)
    );
  });
  return rows;
}
