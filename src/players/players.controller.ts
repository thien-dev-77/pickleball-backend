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
  CreatePlayerDto,
  PlayerQueryDto,
  UpdatePlayerDto,
} from './players.dto';
import { PlayersService } from './players.service';

@Controller('players')
export class PlayersController {
  constructor(private readonly players: PlayersService) {}

  @Get() index(@Query() query: PlayerQueryDto) {
    return this.players.index(query);
  }
  @Post() create(@Body() body: CreatePlayerDto) {
    return this.players.create(body);
  }
  @Get(':id') show(@Param('id') id: string) {
    return this.players.show(id);
  }
  @Patch(':id') update(@Param('id') id: string, @Body() body: UpdatePlayerDto) {
    return this.players.update(id, body);
  }
  @Put(':id') replace(@Param('id') id: string, @Body() body: UpdatePlayerDto) {
    return this.players.update(id, body);
  }
  @Delete(':id') @HttpCode(204) remove(@Param('id') id: string) {
    return this.players.remove(id);
  }
}
