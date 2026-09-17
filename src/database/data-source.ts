import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { databaseConnection } from '../common/database-connection';
import { databaseEntities } from './entities';
import { CompetitionWorkflow1789616000000 } from './migrations/1789616000000-CompetitionWorkflow';

export default new DataSource({
  type: 'postgres',
  ...databaseConnection({ DATABASE_URL: process.env.DATABASE_URL }),
  entities: databaseEntities,
  migrations: [CompetitionWorkflow1789616000000],
  migrationsTableName: 'nestjs_migrations',
  synchronize: false,
  installExtensions: false,
});
