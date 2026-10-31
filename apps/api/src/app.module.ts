import { Module, type DynamicModule, type Type } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { AdminApiModule } from './modules/admin-api/admin-api.module';
import { PainelApiModule } from './modules/admin-api/painel-api.module';
import { ChannelModule } from './modules/channel/channel.module';
import { ControleModule } from './modules/controle/controle.module';
import { CrmModule } from './modules/crm/crm.module';
import { InboundModule } from './modules/inbound/inbound.module';
import { OutboundModule, OutboundWorkerModule } from './modules/outbound/outbound.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { SecurityModule } from './modules/security/security.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './queue/redis.module';

/**
 * Módulos de HTTP/webhook (papel `web`). Tasks seguintes (channel, inbound, admin-api...) entram aqui.
 * Módulos que registram processors BullMQ NÃO entram aqui: vão em `workerModules`.
 */
const webModules: Array<Type<unknown> | DynamicModule> = [
  AdminApiModule,
  PainelApiModule,
  RealtimeModule,
  ChannelModule,
  CrmModule,
  OutboundModule,
  ControleModule,
];

/** Módulos com processors BullMQ: só carregam quando PROCESS_ROLE=worker. */
const workerModules: Array<Type<unknown> | DynamicModule> = [InboundModule, OutboundWorkerModule];

const isWorker = process.env.PROCESS_ROLE === 'worker';

@Module({
  imports: [
    // load-env já populou process.env; aqui só validamos (aborta se inválido).
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
    PrismaModule,
    RedisModule,
    QueueModule,
    SecurityModule,
    ...webModules,
    ...(isWorker ? workerModules : []),
  ],
  controllers: isWorker ? [] : [HealthController],
})
export class AppModule {}
