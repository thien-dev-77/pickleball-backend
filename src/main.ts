import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DatabaseExceptionFilter } from './common/database-exception.filter';
import { validationException } from './common/validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const configuredOrigins =
    config.get<string>('CORS_ORIGINS') ||
    config.get<string>('CORS_ALLOWED_ORIGINS') ||
    '';
  const localOrigins =
    config.get<string>('APP_ENV') === 'local' ||
    process.env.NODE_ENV !== 'production'
      ? 'http://localhost:3000,http://127.0.0.1:3000'
      : '';
  const origins = `${configuredOrigins},${localOrigins}`
    .split(',')
    .map((origin) => origin.trim())
    .filter(
      (origin, index, values) =>
        Boolean(origin) && values.indexOf(origin) === index,
    );

  app.setGlobalPrefix('api');
  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: validationException,
    }),
  );
  app.useGlobalFilters(new DatabaseExceptionFilter());
  app.enableShutdownHooks();
  await app.listen(config.get<number>('PORT', 8001));
}
void bootstrap();
