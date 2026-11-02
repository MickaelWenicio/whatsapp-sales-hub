import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { EvolutionAdapter } from './adapters/evolution.adapter';
import { ChannelHealthService } from './channel-health.service';
import { CHANNEL_PORT } from './channel.port';
import { InboundReconciler } from './inbound-reconciler.service';
import { NumerosService } from './numeros.service';
import { WebhookController } from './webhook.controller';

/** Canal WhatsApp (Evolution): porta, webhook, saúde e números. */
@Module({
  imports: [RealtimeModule],
  controllers: [WebhookController],
  providers: [{ provide: CHANNEL_PORT, useClass: EvolutionAdapter }, ChannelHealthService, NumerosService, InboundReconciler],
  exports: [CHANNEL_PORT, ChannelHealthService, NumerosService],
})
export class ChannelModule {}
