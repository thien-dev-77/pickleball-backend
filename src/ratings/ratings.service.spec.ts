import { DataSource } from 'typeorm';
import { RatingsService } from './ratings.service';

describe('RatingsService', () => {
  const service = new RatingsService({} as DataSource);

  it('calculates unique valid rules and caps the rating at 6', () => {
    const result = service.calculate({
      base_rating: 5,
      passed_rules: [
        'serve_consistency',
        'serve_consistency',
        'low_unforced_errors',
        'unknown',
      ],
    });

    expect(result.passed_rules).toEqual([
      'serve_consistency',
      'low_unforced_errors',
    ]);
    expect(result.bonus).toBe(1.25);
    expect(result.rating).toBe(6);
    expect(result.rules).toHaveLength(6);
  });

  it('handles an omitted rule list', () => {
    const result = service.calculate({ base_rating: 2.75, passed_rules: [] });
    expect(result.rating).toBe(2.75);
    expect(result.bonus).toBe(0);
  });
});
