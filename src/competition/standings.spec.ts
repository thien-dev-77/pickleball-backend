import { rankGroup } from './standings';
import { Team, TournamentMatch } from '../database/entities';

const teams = ['a', 'b', 'c'].map((id) => ({ id }) as Team);
const result = (a: string, b: string, winner: string, sa = 11, sb = 9) =>
  ({
    teamAId: a,
    teamBId: b,
    winnerTeamId: winner,
    scoreA: sa,
    scoreB: sb,
  }) as TournamentMatch;

describe('club pool standings', () => {
  it('uses wins before rally-point difference', () => {
    const rankings = rankGroup(teams.slice(0, 2), [
      result('a', 'b', 'b', 23, 22),
    ]);
    expect(rankings[0].team.id).toBe('b');
    expect(rankings[0].points).toBe(1);
  });
  it('uses direct head-to-head only for two-team ties', () => {
    const games = [
      result('a', 'b', 'b', 11, 9),
      result('a', 'c', 'a', 11, 0),
      result('b', 'c', 'b', 11, 0),
    ];
    expect(rankGroup(teams, games).map((r) => r.team.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });
  it('uses mini-table point difference before full-tournament difference for three-team ties', () => {
    const games = [
      result('a', 'b', 'a', 11, 5),
      result('b', 'c', 'b', 11, 10),
      result('c', 'a', 'c', 11, 10),
      result('a', 'd', 'a', 11, 0),
      result('b', 'd', 'b', 11, 0),
      result('c', 'd', 'c', 11, 9),
    ];
    const pool = [...teams, { id: 'd' } as Team];
    expect(
      rankGroup(pool, games)
        .map((r) => r.team.id)
        .slice(0, 3),
    ).toEqual(['a', 'c', 'b']);
  });
  it('flags circular ties instead of silently qualifying a UUID', () => {
    const games = [
      result('a', 'b', 'a'),
      result('b', 'c', 'b'),
      result('c', 'a', 'c'),
    ];
    expect(rankGroup(teams, games).every((r) => r.tied)).toBe(true);
    const resolved = rankGroup(teams, games, ['c', 'a', 'b']);
    expect(resolved.map((r) => r.team.id)).toEqual(['c', 'a', 'b']);
    expect(resolved.every((r) => !r.tied)).toBe(true);
  });
  it('ignores unfinished fixtures and keeps explicit tie decisions below sporting criteria', () => {
    const rankings = rankGroup(
      teams,
      [
        result('a', 'b', 'a'),
        { teamAId: 'a', teamBId: 'c' } as TournamentMatch,
      ],
      ['b', 'c', 'a'],
    );
    expect(rankings[0].team.id).toBe('a');
    expect(rankings[0].played).toBe(1);
  });
});
