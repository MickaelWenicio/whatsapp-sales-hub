import { Module } from '@nestjs/common';
import { ControleModule } from '../controle/controle.module';
import { CrmModule } from '../crm/crm.module';
import { OutboundModule } from '../outbound/outbound.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ClaudeClient } from './claude.client';
import { AGENTE_LLM } from './llm.types';
import { Orquestrador } from './orchestrator';
import { ResumoProcessor, ResumoService } from './resumo.service';
import { CrmTools } from './tools/crm.tools';
import { Dispatcher } from './tools/dispatcher';
import { FunilTools } from './tools/funil.tools';
import { ResponderTool } from './tools/responder.tool';
import { SegurancaTools } from './tools/seguranca.tools';

/**
 * Agente comercial (Claude + ferramentas) e resumo. Só no papel worker (importado pelo
 * InboundModule): registra o consumidor da fila `resumo`.
 */
@Module({
  imports: [OutboundModule, ControleModule, CrmModule, RealtimeModule],
  providers: [
    { provide: AGENTE_LLM, useClass: ClaudeClient },
    ResponderTool,
    CrmTools,
    FunilTools,
    SegurancaTools,
    Dispatcher,
    ResumoService,
    ResumoProcessor,
    Orquestrador,
  ],
  exports: [Orquestrador, ResumoService],
})
export class AgentModule {}
