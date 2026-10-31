import type { ConfigService } from '@nestjs/config';
import { lerTermosProibidos } from '@sales-hub/shared';

/** Defaults do agente (fonte única; o `.env` sobrescreve). */
export const AGENT_MODEL_PADRAO = 'claude-opus-5-5';
export const AGENT_EFFORT_PADRAO = 'low';
export const AGENT_HISTORICO_MAX_PADRAO = 40;

/** Defaults da empresa que o agente representa (o `.env` sobrescreve com EMPRESA_NOME/EMPRESA_DESCRICAO). */
export const EMPRESA_NOME_PADRAO = 'Empresa Exemplo';
export const EMPRESA_DESCRICAO_PADRAO = 'Empresa de serviços por assinatura para pessoas e empresas.';

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AgentEffort = (typeof EFFORTS)[number];

export interface AgentConfig {
  model: string;
  effort: AgentEffort;
  historicoMax: number;
}

/**
 * Política de parâmetros da Messages API: adaptive thinking, SEM temperature/top_p/top_k,
 * SEM prefill de assistant, prompt caching do prefixo estável.
 */
export const CLAUDE_REQUEST_POLICY = {
  thinking: { type: 'adaptive' as const },
  useSamplingParams: false,
  useAssistantPrefill: false,
  cacheSystemPrompt: true,
} as const;

/** Lê modelo, esforço e janela de histórico da config validada. */
export function getAgentConfig(config: ConfigService): AgentConfig {
  const effort = config.get<string>('AGENT_EFFORT');
  return {
    model: config.get<string>('AGENT_MODEL') || AGENT_MODEL_PADRAO,
    effort: (EFFORTS as readonly string[]).includes(effort ?? '')
      ? (effort as AgentEffort)
      : AGENT_EFFORT_PADRAO,
    historicoMax: Number(config.get('AGENT_HISTORICO_MAX')) || AGENT_HISTORICO_MAX_PADRAO,
  };
}

export interface EmpresaConfig {
  /** Nome da empresa como o agente se apresenta. */
  nome: string;
  /** Uma ou duas frases sobre o que a empresa oferece. */
  descricao: string;
  /** Palavras ou expressões que o agente não pode usar (filtro de saída e prompt). */
  termosProibidos: string[];
}

/** Lê nome, descrição e termos proibidos da empresa da config validada. */
export function getEmpresaConfig(config: ConfigService): EmpresaConfig {
  return {
    nome: config.get<string>('EMPRESA_NOME')?.trim() || EMPRESA_NOME_PADRAO,
    descricao: config.get<string>('EMPRESA_DESCRICAO')?.trim() || EMPRESA_DESCRICAO_PADRAO,
    termosProibidos: lerTermosProibidos(config.get<string>('AGENT_TERMOS_PROIBIDOS')),
  };
}
