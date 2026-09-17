import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompetitionWorkflow1789616000000 implements MigrationInterface {
  async up(query: QueryRunner): Promise<void> {
    await query.query(
      `ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS metadata jsonb`,
    );
    await query.query(`CREATE TABLE IF NOT EXISTS tournament_registrations (
      id uuid PRIMARY KEY,
      tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      player_id uuid NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
      status varchar(20) NOT NULL DEFAULT 'registered',
      notes text,
      created_at timestamp(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamp(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT tournament_registrations_unique UNIQUE (tournament_id, player_id)
    )`);
    await query.query(
      `CREATE INDEX IF NOT EXISTS tournament_registrations_status_idx ON tournament_registrations(tournament_id, status)`,
    );
    // Backfill only players already assigned to a team, never the entire player catalog.
    await query.query(`INSERT INTO tournament_registrations(id, tournament_id, player_id, status)
      SELECT gen_random_uuid(), tournament_id, player_id, 'confirmed' FROM (
        SELECT tournament_id, player_one_id AS player_id FROM teams
        UNION SELECT tournament_id, player_two_id FROM teams WHERE player_two_id IS NOT NULL
      ) existing ON CONFLICT (tournament_id, player_id) DO NOTHING`);
    await query.query(`UPDATE tournaments t
      SET settings = COALESCE(settings, '{}'::jsonb) || '{"roster_locked":true}'::jsonb
      WHERE NOT COALESCE(settings, '{}'::jsonb) ? 'roster_locked'
      AND EXISTS (SELECT 1 FROM teams WHERE tournament_id = t.id)`);
  }

  async down(query: QueryRunner): Promise<void> {
    await query.query(`DROP TABLE tournament_registrations`);
    await query.query(`ALTER TABLE tournament_matches DROP COLUMN metadata`);
  }
}
