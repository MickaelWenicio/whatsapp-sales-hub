import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getAgentConfig } from '../../config/claude';
import type { AgenteLLM, EntradaLLM } from './llm.types';

/**
 * Adapter da Messages API (skill claude-api, SDK instalado): streaming com `finalMessage()`,
 * fallback de recusa no servidor (`fallbacks: 'default'` + beta `server-side-fallback-2026-07-01`),
 * `output_config.effort`, sem `thinking` (adaptativo é o padrão), `tool_choice` auto (forçar dá
 * 400 neste modelo). Cliente criado na primeira chamada; `maxRetries` padrão do SDK (2).
 */
@Injectable()
export class ClaudeClient implements AgenteLLM {
  private readonly logger = new Logger(ClaudeClient.name);
  private client?: Anthropic;

  constructor(private readonly config: ConfigService) {}

  async responder(input: EntradaLLM): Promise<Anthropic.Beta.BetaMessage> {
    const { model, effort } = getAgentConfig(this.config);
    this.client ??= new Anthropic();
    for (let tentativa = 0; ; tentativa++) {
      try {
        const stream = this.client.beta.messages.stream({
          model,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort },
          system: input.system,
          tools: input.tools,
          tool_choice: { type: 'auto' },
          messages: input.messages,
        }, { signal: AbortSignal.timeout(60_000) });
        return await stream.finalMessage();
      } catch (e) {
        // Com eager_input_streaming, um JSON de ferramenta impossível de ler rejeita o finalMessage
        // com um erro que não é da API: só esse caso é repetido aqui (até 2 vezes). Erros da API já
        // passaram pelas novas tentativas do SDK e sobem para o orquestrador (contingência).
        if (e instanceof Anthropic.APIError || tentativa >= 2) throw e;
        this.logger.warn(`entrada de ferramenta ilegível, repetindo a chamada (${(e as Error).message})`);
      }
    }
  }
}
