import { MigrationInterface, QueryRunner } from 'typeorm';

export class TeamPaymentConfirmed1789974000000
  implements MigrationInterface
{
  name = 'TeamPaymentConfirmed1789974000000';

  async up(query: QueryRunner): Promise<void> {
    await query.query(`
      ALTER TABLE teams
      ADD COLUMN IF NOT EXISTS payment_confirmed boolean NOT NULL DEFAULT false
    `);
  }

  async down(query: QueryRunner): Promise<void> {
    await query.query(`
      ALTER TABLE teams
      DROP COLUMN IF EXISTS payment_confirmed
    `);
  }
}
