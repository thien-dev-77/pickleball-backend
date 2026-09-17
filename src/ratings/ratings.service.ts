import { Injectable } from '@nestjs/common';
import { assessmentResponse, playerResponse } from '../common/serializers';
import { DataSource } from 'typeorm';
import { Player, RatingAssessment } from '../database/entities';
import { AssessPlayerDto, CalculateRatingDto } from './ratings.dto';
import { preserveRosterSnapshot } from '../common/roster-snapshot';

const RULES = {
  serve_consistency: { label: 'Giao bóng ổn định', points: 0.25 },
  kitchen_control: { label: 'Kiểm soát dink và kitchen', points: 0.5 },
  volley_reflex: { label: 'Volley phản xạ tốt', points: 0.5 },
  reset_under_pressure: { label: 'Biết reset bóng khi bị ép', points: 0.5 },
  double_strategy: {
    label: 'Chiến thuật đôi và di chuyển hợp lý',
    points: 0.75,
  },
  low_unforced_errors: {
    label: 'Tấn công chủ động, ít lỗi tự đánh hỏng',
    points: 1,
  },
} as const;

@Injectable()
export class RatingsService {
  constructor(private readonly db: DataSource) {}

  rules() {
    return Object.entries(RULES).map(([key, rule]) => ({ key, ...rule }));
  }

  calculate(dto: CalculateRatingDto) {
    const passedRules = [...new Set(dto.passed_rules ?? [])].filter(
      (key) => key in RULES,
    );
    const bonus = passedRules.reduce(
      (sum, key) => sum + RULES[key as keyof typeof RULES].points,
      0,
    );
    return {
      base_rating: dto.base_rating,
      passed_rules: passedRules,
      bonus: Number(bonus.toFixed(2)),
      rating: Math.min(6, Number((dto.base_rating + bonus).toFixed(2))),
      rules: this.rules(),
    };
  }

  async assess(playerId: string, dto: AssessPlayerDto) {
    await this.db.getRepository(Player).findOneByOrFail({ id: playerId });
    const result = this.calculate(dto);
    const saved = await this.db.transaction(async (manager) => {
      await preserveRosterSnapshot(manager, playerId);
      const assessments = manager.getRepository(RatingAssessment);
      const assessment = await assessments.save(
        assessments.create({
          playerId,
          baseRating: result.base_rating,
          passedRules: result.passed_rules,
          bonus: result.bonus,
          rating: result.rating,
          notes: dto.notes ?? null,
          assessedAt: new Date(),
        }),
      );
      await manager.update(Player, playerId, { rating: result.rating });
      const player = await manager.findOneByOrFail(Player, { id: playerId });
      return { assessment, player };
    });
    return {
      assessment: assessmentResponse(saved.assessment),
      player: playerResponse(saved.player),
    };
  }
}
