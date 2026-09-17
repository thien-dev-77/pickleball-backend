import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConnection } from '../common/database-connection';
import { databaseEntities } from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        ...databaseConnection({
          DATABASE_URL: config.get<string>('DATABASE_URL'),
        }),
        entities: databaseEntities,
        synchronize: false,
        migrationsRun: false,
        installExtensions: false,
        retryAttempts: 1,
        extra: {
          max: process.env.VERCEL ? 2 : 10,
          connectionTimeoutMillis: 10000,
          idleTimeoutMillis: 10000,
        },
        invalidWhereValuesBehavior: {
          null: 'throw' as const,
          undefined: 'throw' as const,
        },
      }),
    }),
  ],
})
export class DatabaseModule {}
