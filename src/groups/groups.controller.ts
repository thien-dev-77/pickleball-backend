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
import {
  CreateGroupDto,
  RandomizeGroupsDto,
  UpdateGroupDto,
} from './groups.dto';
import { GroupsService } from './groups.service';

@Controller()
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}
  @Get('tournaments/:tournamentId/groups') index(
    @Param('tournamentId') id: string,
  ) {
    return this.groups.index(id);
  }
  @Post('tournaments/:tournamentId/groups') create(
    @Param('tournamentId') id: string,
    @Body() body: CreateGroupDto,
  ) {
    return this.groups.create(id, body);
  }
  @Post('tournaments/:tournamentId/groups/randomize') randomize(
    @Param('tournamentId') id: string,
    @Body() body: RandomizeGroupsDto,
  ) {
    return this.groups.randomize(id, body);
  }
  @Get('groups/:id') show(@Param('id') id: string) {
    return this.groups.show(id);
  }
  @Patch('groups/:id') update(
    @Param('id') id: string,
    @Body() body: UpdateGroupDto,
  ) {
    return this.groups.update(id, body);
  }
  @Put('groups/:id') replace(
    @Param('id') id: string,
    @Body() body: UpdateGroupDto,
  ) {
    return this.groups.update(id, body);
  }
  @Delete('groups/:id') @HttpCode(204) remove(@Param('id') id: string) {
    return this.groups.remove(id);
  }
}
