import './config/load-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { logger } from './common/logger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '16mb' });
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3311;
  await app.listen(port);
  logger.info(
    { port, role: config.get('PROCESS_ROLE'), canal: config.get('CHANNEL_CONNECTOR') },
    `[web] API ouvindo em http://localhost:${port}`,
  );
}

void bootstrap();
