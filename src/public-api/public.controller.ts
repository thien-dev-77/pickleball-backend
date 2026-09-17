import { Controller, Get, Param, Query } from '@nestjs/common';
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
  @Get('tournaments/:slug') show(@Param('slug') slug: string) {
    return this.publicApi.show(slug);
  }
}
