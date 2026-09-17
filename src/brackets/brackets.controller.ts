import { Controller, Get, Param, Post } from '@nestjs/common';
import { BracketsService } from './brackets.service';

@Controller('tournaments/:tournamentId/brackets')
export class BracketsController {
  constructor(private readonly brackets: BracketsService) {}
  @Get() index(@Param('tournamentId') id: string) {
    return this.brackets.index(id);
  }
  @Post('generate') generate(@Param('tournamentId') id: string) {
    return this.brackets.generate(id);
  }
}
