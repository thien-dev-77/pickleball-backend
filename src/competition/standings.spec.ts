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
    expect(
      rankGroup(teams.slice(0, 2), [result('a', 'b', 'b', 23, 22)])[0].team.id,
    ).toBe('b');
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
