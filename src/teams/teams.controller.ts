import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { CreateTeamDto, GenerateTeamsDto, UpdateTeamDto } from './teams.dto';
import { TeamsService } from './teams.service';

@Controller()
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}
  @Get('tournaments/:tournamentId/teams') index(
    @Param('tournamentId') id: string,
  ) {
    return this.teams.index(id);
  }
  @Post('tournaments/:tournamentId/teams') create(
    @Param('tournamentId') id: string,
    @Body() body: CreateTeamDto,
  ) {
    return this.teams.create(id, body);
  }
  @Post('tournaments/:tournamentId/teams/generate') generate(
    @Param('tournamentId') id: string,
    @Body() body: GenerateTeamsDto,
  ) {
    return this.teams.generate(id, body);
  }
  @Get('teams/:id') show(@Param('id') id: string) {
    return this.teams.show(id);
  }
  @Patch('teams/:id') update(
    @Param('id') id: string,
    @Body() body: UpdateTeamDto,
  ) {
    return this.teams.update(id, body);
  }
  @Put('teams/:id') replace(
    @Param('id') id: string,
    @Body() body: UpdateTeamDto,
  ) {
    return this.teams.update(id, body);
  }
  @Delete('teams/:id') @HttpCode(204) remove(@Param('id') id: string) {
    return this.teams.remove(id);
  }
}
