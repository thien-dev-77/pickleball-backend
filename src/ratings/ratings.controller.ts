import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AssessPlayerDto, CalculateRatingDto } from './ratings.dto';
import { RatingsService } from './ratings.service';

@Controller()
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}
  @Get('ratings/rules') rules() {
    return this.ratings.rules();
  }
  @Post('ratings/calculate') calculate(@Body() body: CalculateRatingDto) {
    return this.ratings.calculate(body);
  }
  @Post('players/:playerId/ratings') assess(
    @Param('playerId') playerId: string,
    @Body() body: AssessPlayerDto,
  ) {
    return this.ratings.assess(playerId, body);
  }
}
