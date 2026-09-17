import type { FindOptionsRelations } from 'typeorm';
import { Team, TournamentGroup, TournamentMatch } from './entities';

export const teamRelations: FindOptionsRelations<Team> = {
  playerOne: true,
  playerTwo: true,
};
export const groupRelations: FindOptionsRelations<TournamentGroup> = {
  teams: { team: teamRelations },
};
export const matchRelations: FindOptionsRelations<TournamentMatch> = {
  teamA: teamRelations,
  teamB: teamRelations,
  group: true,
};
export const publicMatchRelations: FindOptionsRelations<TournamentMatch> = {
  ...matchRelations,
  tournament: true,
};
