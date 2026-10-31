import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QUEUES } from './queue.constants';
import { parseRedisUrl } from './redis-connection';

/**
 * Filas BullMQ sobre Redis. Retry com backoff exponencial; falhas ficam retidas
 * (dead-letter/visibilidade). O webhook responde 200 rápido e enfileira aqui.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: parseRedisUrl(config.get<string>('REDIS_URL') ?? 'redis://localhost:6379'),
        defaultJobOptions: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: false, // mantém jobs falhos como dead-letter até inspeção
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUES.INBOUND },
      { name: QUEUES.AGENT_TURN },
      { name: QUEUES.OUTBOUND },
      { name: QUEUES.RESUMO },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
