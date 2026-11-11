import type Anthropic from '@anthropic-ai/sdk';

/**
 * Abstração do LLM condutor. O orquestrador depende desta interface, não do SDK, para testar
 * com um LLM falso (respostas `BetaMessage` roteirizadas) sem chave de API.
 */
export const AGENTE_LLM = Symbol('AGENTE_LLM');

export interface EntradaLLM {
  system: Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  tools: Anthropic.Beta.BetaTool[];
}

export interface AgenteLLM {
  /** Uma chamada à Messages API. Lança em erro da API (depois das novas tentativas do SDK). */
  responder(input: EntradaLLM): Promise<Anthropic.Beta.BetaMessage>;
}

/** Resultado de um turno do agente (gravado em `AgentTurn.resultado`). */
export type ResultadoTurnoAgente = 'ok' | 'ignorado' | 'abortado' | 'falha' | 'recusa';

/** Opções de execução do agente (injeção opcional; os testes encurtam as esperas). */
export const OPCOES_AGENTE = Symbol('OPCOES_AGENTE');
export interface OpcoesAgente {
  /** Quanto esperar as bolhas do turno saírem antes de transferir (a despedida não é cancelada). */
  esperaSaidaMs?: number;
}
