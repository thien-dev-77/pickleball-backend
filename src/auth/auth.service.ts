import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { AdminSession } from '../database/entities';
import { LoginDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  async login(credentials: LoginDto) {
    const isLocal =
      this.config.get<string>('APP_ENV') === 'local' ||
      ['development', 'test'].includes(process.env.NODE_ENV ?? '');
    const username =
      this.config.get<string>('ADMIN_USERNAME') || (isLocal ? 'admin' : '');
    const password =
      this.config.get<string>('ADMIN_PASSWORD') ||
      (isLocal ? 'admin123456' : '');

    if (!username || !password) {
      this.invalid(
        'username',
        'Chưa cấu hình ADMIN_USERNAME và ADMIN_PASSWORD trong backend-nestjs/.env.',
      );
    }
    if (
      !this.equal(username, credentials.username) ||
      !this.equal(password, credentials.password)
    ) {
      this.invalid('password', 'Tài khoản hoặc mật khẩu không đúng.');
    }

    const now = new Date();
    const sessions = this.db.getRepository(AdminSession);
    await sessions.delete({ expiresAt: LessThanOrEqual(now) });
    const token = randomBytes(60).toString('base64url');
    const hours = Math.max(
      1,
      this.config.get<number>('ADMIN_SESSION_HOURS', 12),
    );
    const expiresAt = new Date(now.getTime() + hours * 3_600_000);
    await sessions.save(
      sessions.create({
        tokenHash: createHash('sha256').update(token).digest('hex'),
        username,
        expiresAt,
        lastUsedAt: now,
      }),
    );

    return { token, expires_at: expiresAt.toISOString(), user: { username } };
  }

  private equal(expected: string, actual: string) {
    const left = Buffer.from(expected);
    const right = Buffer.from(actual);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private invalid(field: string, message: string): never {
    throw new UnprocessableEntityException({
      message,
      errors: { [field]: [message] },
    });
  }
}
