import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BracketsModule } from './brackets/brackets.module';
import { AdminAuthGuard } from './common/admin-auth.guard';
import { DatabaseModule } from './database/database.module';
import { GroupsModule } from './groups/groups.module';
import { MatchesModule } from './matches/matches.module';
import { PlayersModule } from './players/players.module';
import { PublicModule } from './public-api/public.module';
import { RatingsModule } from './ratings/ratings.module';
import { TeamsModule } from './teams/teams.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { CompetitionModule } from './competition/competition.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    CompetitionModule,
    UploadsModule,
    AuthModule,
    PublicModule,
    PlayersModule,
    RatingsModule,
    TournamentsModule,
    TeamsModule,
    GroupsModule,
    MatchesModule,
    BracketsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: AdminAuthGuard }],
})
export class AppModule {}
