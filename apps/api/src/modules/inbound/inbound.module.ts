import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentModule } from '../agent/agent.module';
import { Orquestrador as OrquestradorClaude } from '../agent/orchestrator';
import { RealtimeModule } from '../realtime/realtime.module';
import { OutboundModule } from '../outbound/outbound.module';
import { AgentTurnProcessor } from './agent-turn.processor';
import { InboundProcessor } from './inbound.processor';
import { ORQUESTRADOR, type Orquestrador, type ResultadoTurno } from './orquestrador.token';
import { OrquestradorDemo } from './orquestrador-demo';
import { TurnoLockService } from './turno-lock.service';

/** Resultado do agente (brief da Task 10) para o contrato da entrada (só registrado em log). */
const PARA_ENTRADA = { ok: 'respondido', recusa: 'escalado', abortado: 'escalado', falha: 'falhou', ignorado: 'ignorado' } as const;

/**
 * Entrada: ingestão (inbound-process) e turno do agente (agent-turn). Só carrega no papel
 * worker. Com ANTHROPIC_API_KEY, o turno é o agente real (Claude); sem chave, o roteiro local
 * de demonstração (OrquestradorDemo) continua como reserva.
 */
@Module({
  imports: [RealtimeModule, OutboundModule, AgentModule],
  providers: [
    InboundProcessor,
    AgentTurnProcessor,
    TurnoLockService,
    OrquestradorDemo,
    {
      provide: ORQUESTRADOR,
      inject: [ConfigService, OrquestradorClaude, OrquestradorDemo],
      useFactory: (config: ConfigService, claude: OrquestradorClaude, demo: OrquestradorDemo): Orquestrador =>
        config.get<string>('ANTHROPIC_API_KEY')
          ? { processar: async (id, sinais): Promise<ResultadoTurno> => PARA_ENTRADA[await claude.processar(id, sinais)] }
          : demo,
    },
  ],
  exports: [TurnoLockService, ORQUESTRADOR],
})
export class InboundModule {}
