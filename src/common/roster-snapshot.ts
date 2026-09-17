import { EntityManager } from 'typeorm';
import {
  Player,
  Tournament,
  TournamentRegistration,
} from '../database/entities';

type Snapshot = Record<string, { rating: number; gender: string }>;

export function rosterSnapshot(
  registrations: TournamentRegistration[],
): Snapshot {
  return Object.fromEntries(
    registrations
      .filter((r) => r.status === 'confirmed')
      .map((r) => [
        r.playerId,
        { rating: Number(r.player.rating), gender: r.player.gender },
      ]),
  );
}

export function rosterPlayer(player: Player, tournament: Tournament): Player {
  const snapshot = tournament.settings?.roster_snapshot as Snapshot | undefined;
  return Object.assign(new Player(), player, snapshot?.[player.id] ?? {});
}

export async function preserveRosterSnapshot(
  manager: EntityManager,
  playerId: string,
) {
  const registrations = await manager.findBy(TournamentRegistration, {
    playerId,
    status: 'confirmed',
  });
  const ids = [...new Set(registrations.map((r) => r.tournamentId))].sort();
  // Older tournaments have no snapshot; capture the entire roster before editing any profile.
  for (const id of ids) {
    const tournament = await manager.findOneOrFail(Tournament, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !tournament.settings?.roster_locked ||
      tournament.settings?.roster_snapshot
    )
      continue;
    const roster = await manager.find(TournamentRegistration, {
      where: { tournamentId: id, status: 'confirmed' },
      relations: { player: true },
    });
    await manager.update(Tournament, id, {
      settings: {
        ...tournament.settings,
        roster_snapshot: rosterSnapshot(roster),
      },
    });
  }
}
