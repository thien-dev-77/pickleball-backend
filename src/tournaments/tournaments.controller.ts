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
  Query,
} from '@nestjs/common';
import {
  CreateTournamentDto,
  TournamentQueryDto,
  UpdateTournamentDto,
} from './tournaments.dto';
import { TournamentsService } from './tournaments.service';

@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournaments: TournamentsService) {}
  @Get() index(@Query() query: TournamentQueryDto) {
    return this.tournaments.index(query);
  }
  @Post() create(@Body() body: CreateTournamentDto) {
    return this.tournaments.create(body);
  }
  @Get(':id') show(@Param('id') id: string) {
    return this.tournaments.show(id);
  }
  @Patch(':id') update(
    @Param('id') id: string,
    @Body() body: UpdateTournamentDto,
  ) {
    return this.tournaments.update(id, body);
  }
  @Put(':id') replace(
    @Param('id') id: string,
    @Body() body: UpdateTournamentDto,
  ) {
    return this.tournaments.update(id, body);
  }
  @Delete(':id') @HttpCode(204) remove(@Param('id') id: string) {
    return this.tournaments.remove(id);
  }
}
