import { Module } from '@nestjs/common';
import { ChannelModule } from '../channel/channel.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { OutboundProcessor } from './outbound.processor';
import { OutboundService } from './outbound.service';

/**
 * Produtor da saída (`OutboundService`): importável pelos papéis web e worker.
 * A fila `QUEUES.OUTBOUND` vem do QueueModule global.
 */
@Module({
  imports: [RealtimeModule],
  providers: [OutboundService],
  exports: [OutboundService],
})
export class OutboundModule {}

/**
 * Consumidor da saída (`OutboundProcessor`): só no papel worker (`workerModules`), senão o
 * processo web também abriria um Worker BullMQ.
 */
@Module({
  imports: [OutboundModule, ChannelModule, RealtimeModule],
  providers: [OutboundProcessor],
})
export class OutboundWorkerModule {}
