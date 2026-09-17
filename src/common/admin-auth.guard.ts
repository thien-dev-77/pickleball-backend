import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { DataSource, MoreThan } from 'typeorm';
import { AdminSession } from '../database/entities';
import { IS_PUBLIC_KEY } from './public.decorator';
import { RequestWithAdmin } from './request-with-admin';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithAdmin>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : '';
    if (!token) throw new UnauthorizedException('Cần đăng nhập admin.');

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const now = new Date();
    const sessions = this.db.getRepository(AdminSession);
    const session = await sessions.findOneBy({
      tokenHash,
      expiresAt: MoreThan(now),
    });
    if (!session) {
      throw new UnauthorizedException(
        'Phiên đăng nhập admin đã hết hạn hoặc không hợp lệ.',
      );
    }

    const touchMinutes = Math.max(
      1,
      this.config.get<number>('ADMIN_SESSION_TOUCH_MINUTES', 5),
    );
    if (
      !session.lastUsedAt ||
      session.lastUsedAt.getTime() <= now.getTime() - touchMinutes * 60_000
    ) {
      await sessions.update(session.id, { lastUsedAt: now });
    }
    request.adminSession = {
      id: session.id,
      username: session.username,
      expiresAt: session.expiresAt,
    };
    return true;
  }
}
