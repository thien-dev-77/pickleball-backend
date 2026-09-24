import { Team, TournamentMatch } from '../database/entities';

type StandingRow = {
  team: Team;
  played: number;
  wins: number;
  losses: number;
  points_for: number;
  points_against: number;
  diff: number;
  points: number;
  head_to_head: number;
  tied: boolean;
};

function miniStats(
  row: StandingRow,
  rows: StandingRow[],
  matches: TournamentMatch[],
) {
  const ids = new Set(rows.map((r) => r.team.id));
  const played = matches.filter(
    (m) =>
      m.winnerTeamId &&
      ids.has(m.teamAId ?? '') &&
      ids.has(m.teamBId ?? '') &&
      (m.teamAId === row.team.id || m.teamBId === row.team.id),
  );
  const pointsFor = played.reduce(
    (sum, m) =>
      sum + (m.teamAId === row.team.id ? (m.scoreA ?? 0) : (m.scoreB ?? 0)),
    0,
  );
  const pointsAgainst = played.reduce(
    (sum, m) =>
      sum + (m.teamAId === row.team.id ? (m.scoreB ?? 0) : (m.scoreA ?? 0)),
    0,
  );
  return {
    wins: played.filter((m) => m.winnerTeamId === row.team.id).length,
    points_for: pointsFor,
    diff: pointsFor - pointsAgainst,
  };
}

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
      points: wins,
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
  const tieRank = (a: StandingRow, b: StandingRow, tiedRows: StandingRow[]) => {
    if (tiedRows.length === 2) return b.head_to_head - a.head_to_head;
    if (tiedRows.length > 2) {
      const aMini = miniStats(a, tiedRows, matches);
      const bMini = miniStats(b, tiedRows, matches);
      return bMini.diff - aMini.diff || bMini.points_for - aMini.points_for;
    }
    return 0;
  };
  const tieOrderRank = (a: StandingRow, b: StandingRow) =>
    tieOrder.includes(a.team.id) && tieOrder.includes(b.team.id)
      ? tieOrder.indexOf(a.team.id) - tieOrder.indexOf(b.team.id)
      : 0;
  const compareWithinTie = (
    a: StandingRow,
    b: StandingRow,
    tiedRows: StandingRow[],
    includeTieOrder: boolean,
  ) =>
    tieRank(a, b, tiedRows) ||
    b.diff - a.diff ||
    b.points_for - a.points_for ||
    (includeTieOrder ? tieOrderRank(a, b) : 0);
  rows.sort((a, b) => b.wins - a.wins);
  for (let start = 0; start < rows.length;) {
    let end = start + 1;
    while (end < rows.length && rows[end].wins === rows[start].wins) end++;
    const tiedRows = rows.slice(start, end);
    tiedRows.sort((a, b) => compareWithinTie(a, b, tiedRows, true));
    rows.splice(start, tiedRows.length, ...tiedRows);
    start = end;
  }
  rows.forEach((row, i) => {
    const sameWins = rows.filter((r) => r.wins === row.wins);
    row.tied = !!(
      (i > 0 &&
        row.wins === rows[i - 1].wins &&
        compareWithinTie(row, rows[i - 1], sameWins, true) === 0) ||
      (i + 1 < rows.length &&
        row.wins === rows[i + 1].wins &&
        compareWithinTie(row, rows[i + 1], sameWins, true) === 0)
    );
  });
  return rows;
}
