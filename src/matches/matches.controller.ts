import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  GenerateRoundRobinDto,
  MatchQueryDto,
  MatchResultDto,
  UpdateMatchDto,
} from './matches.dto';
import { MatchesService } from './matches.service';

@Controller()
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}
  @Get('matches') index(@Query() query: MatchQueryDto) {
    return this.matches.index(query);
  }
  @Get('matches/:id') show(@Param('id') id: string) {
    return this.matches.show(id);
  }
  @Patch('matches/:id') update(
    @Param('id') id: string,
    @Body() body: UpdateMatchDto,
  ) {
    return this.matches.update(id, body);
  }
  @Put('matches/:id') replace(
    @Param('id') id: string,
    @Body() body: UpdateMatchDto,
  ) {
    return this.matches.update(id, body);
  }
  @Post('matches/:id/result') result(
    @Param('id') id: string,
    @Body() body: MatchResultDto,
  ) {
    return this.matches.result(id, body);
  }
  @Post('groups/:groupId/matches/generate-round-robin') generate(
    @Param('groupId') id: string,
    @Body() body: GenerateRoundRobinDto,
  ) {
    return this.matches.generateRoundRobin(id, body);
  }
}
