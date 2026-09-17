import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import type { RequestWithAdmin } from '../common/request-with-admin';
import { AuthService } from './auth.service';
import { LoginDto } from './auth.dto';
import { DataSource } from 'typeorm';
import { AdminSession } from '../database/entities';

@Controller('admin')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly db: DataSource,
  ) {}

  @Public()
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.auth.login(body);
  }

  @Get('status')
  status(@Req() request: RequestWithAdmin) {
    return {
      authenticated: true,
      expires_at: request.adminSession?.expiresAt.toISOString() ?? null,
      user: { username: request.adminSession?.username ?? null },
    };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: RequestWithAdmin) {
    if (request.adminSession) {
      await this.db.getRepository(AdminSession).delete(request.adminSession.id);
    }
  }
}
