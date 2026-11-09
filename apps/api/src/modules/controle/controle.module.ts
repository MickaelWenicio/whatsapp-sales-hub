import { Module } from '@nestjs/common';
import { ChannelModule } from '../channel/channel.module';
import { OutboundModule } from '../outbound/outbound.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ControleService } from './controle.service';

/**
 * Controle humano sobre a IA. Sem processors: importável pelo web (painel) e pelo worker (agente).
 * ChannelModule fornece o CHANNEL_PORT (presença `paused` ao sair de IA_ATIVA); ele já está em
 * `webModules`, então é a mesma instância.
 */
@Module({
  imports: [OutboundModule, RealtimeModule, ChannelModule],
  providers: [ControleService],
  exports: [ControleService],
})
export class ControleModule {}
