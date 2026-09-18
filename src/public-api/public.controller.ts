import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { PublicPlayersQueryDto } from './public.dto';
import { PublicService } from './public.service';

@Public()
@Controller('public')
export class PublicController {
  constructor(private readonly publicApi: PublicService) {}
  @Get('home') home() {
    return this.publicApi.home();
  }
  @Get('schedule') schedule() {
    return this.publicApi.schedule();
  }
  @Get('players') players(@Query() query: PublicPlayersQueryDto) {
    return this.publicApi.players(query);
  }
  @Get('players/:id') player(@Param('id', ParseUUIDPipe) id: string) {
    return this.publicApi.player(id);
  }
  @Get('tournaments/:slug') show(@Param('slug') slug: string) {
    return this.publicApi.show(slug);
  }
}
