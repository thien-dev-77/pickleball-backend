import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CompetitionService } from './competition.service';
import {
  AssignmentDto,
  TieBreakDto,
  CompetitionSettingsDto,
  DrawDto,
  EntriesDto,
  FinalizeDto,
  PlayoffDto,
  RegistrationDto,
  RegistrationUpdateDto,
  RosterLockDto,
  ScheduleDto,
  ScoreDto,
  TournamentOperationDto,
} from './competition.dto';

@Controller()
export class CompetitionController {
  constructor(private readonly competition: CompetitionService) {}
  @Post('tournaments/:id/operation') operation(
    @Param('id') id: string,
    @Body() body: TournamentOperationDto,
  ) {
    return this.competition.operation(id, body);
  }
  @Delete('tournaments/:id/playoff') resetPlayoff(@Param('id') id: string) {
    return this.competition.resetPlayoff(id);
  }
  @Post('tournaments/:id/group-assignment') assignment(
    @Param('id') id: string,
    @Body() body: AssignmentDto,
  ) {
    return this.competition.assignment(id, body);
  }
  @Post('tournaments/:id/tie-break') tieBreak(
    @Param('id') id: string,
    @Body() body: TieBreakDto,
  ) {
    return this.competition.tieBreak(id, body);
  }
  @Get('tournaments/:id/workspace') workspace(@Param('id') id: string) {
    return this.competition.workspace(id);
  }
  @Post('tournaments/:id/registrations') register(
    @Param('id') id: string,
    @Body() body: RegistrationDto,
  ) {
    return this.competition.register(id, body);
  }
  @Patch('tournaments/:id/registrations/:playerId') registration(
    @Param('id') id: string,
    @Param('playerId') playerId: string,
    @Body() body: RegistrationUpdateDto,
  ) {
    return this.competition.registration(id, playerId, body);
  }
  @Post('tournaments/:id/roster-lock') lock(
    @Param('id') id: string,
    @Body() body: RosterLockDto,
  ) {
    return this.competition.rosterLock(id, body.locked);
  }
  @Patch('tournaments/:id/competition-settings') settings(
    @Param('id') id: string,
    @Body() body: CompetitionSettingsDto,
  ) {
    return this.competition.settings(id, body);
  }
  @Post('tournaments/:id/entries/generate') entries(
    @Param('id') id: string,
    @Body() body: EntriesDto,
  ) {
    return this.competition.entries(id, body);
  }
  @Post('tournaments/:id/draw') draw(
    @Param('id') id: string,
    @Body() body: DrawDto,
  ) {
    return this.competition.draw(id, body);
  }
  @Post('tournaments/:id/schedule') schedule(
    @Param('id') id: string,
    @Body() body: ScheduleDto,
  ) {
    return this.competition.schedule(id, body);
  }
  @Post('tournaments/:id/playoff') playoff(
    @Param('id') id: string,
    @Body() body: PlayoffDto,
  ) {
    return this.competition.playoff(id, body);
  }
  @Post('matches/:id/score') score(
    @Param('id') id: string,
    @Body() body: ScoreDto,
  ) {
    return this.competition.score(id, body);
  }
  @Post('tournaments/:id/finalize') finalize(
    @Param('id') id: string,
    @Body() body: FinalizeDto,
  ) {
    return this.competition.finalize(id, body.apply_rating);
  }
}
