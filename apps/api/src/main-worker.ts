import './config/load-env';
// O worker é sempre PROCESS_ROLE=worker (decide quais módulos o AppModule carrega).
process.env.PROCESS_ROLE = 'worker';

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { logger } from './common/logger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  logger.info('[worker] Worker iniciado.');

  // Mantém o event loop vivo entre jobs.
  const keepAlive = setInterval(() => {
    /* heartbeat */
  }, 60_000);

  const shutdown = async (sinal: string): Promise<void> => {
    logger.info(`[worker] recebido ${sinal}, encerrando...`);
    clearInterval(keepAlive);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
