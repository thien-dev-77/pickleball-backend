import { EntityManager } from 'typeorm';
import { TournamentRegistration } from '../database/entities';
import { businessValidation } from './validation';

export async function assertRatingEditable(
  manager: EntityManager,
  playerId: string,
) {
  const entries = await manager.find(TournamentRegistration, {
    where: { playerId, status: 'confirmed' },
    relations: { tournament: true },
  });
  if (
    entries.some(
      (r) =>
        r.tournament.settings?.roster_locked &&
        r.tournament.status !== 'completed',
    )
  ) {
    businessValidation(
      'rating',
      'VĐV đang thi đấu trong giải đã chốt danh sách; không đổi điểm trình hoặc giới tính.',
    );
  }
}
