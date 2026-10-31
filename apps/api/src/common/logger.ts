import { randomUUID } from 'node:crypto';
import pino, { type Logger, type LoggerOptions } from 'pino';

/**
 * Logger estruturado (pino) com SCRUBBING de PII/segredos (E9-T1, LGPD/P4).
 *
 * Regra de ouro: NUNCA logar em claro cpf/rg/cin_cpf, renda*, telefone, e-mail,
 * o texto de mensagens, senha/senhaHash nem cabeçalhos de autorização. Aqui isso
 * é garantido em duas camadas:
 *   1. `redact` do pino — censura chaves sensíveis por caminho (rápido, no hot path);
 *   2. `scrub()` — varredura recursiva para quem loga objetos de forma arbitrária.
 *
 * Saída em JSON (uma linha por evento) — ideal para coletores em produção. Não
 * usamos transport `pino-pretty` (não está instalado) para não quebrar o runtime.
 */

/** Valor que substitui qualquer dado sensível nos logs. */
export const CENSOR = '[REDACTED]';

/**
 * Chaves consideradas sensíveis. Cobre os campos exigidos pelo contrato + sinônimos
 * comuns no código (camelCase/snake_case) e segredos de infraestrutura.
 */
export const CHAVES_SENSIVEIS: readonly string[] = [
  // Documentos pessoais
  'cpf',
  'rg',
  'cin_cpf',
  'cinCpf',
  // Renda (renda*)
  'renda',
  'rendaBruta',
  'rendaLiquida',
  'rendaMensal',
  'rendaMedia3m',
  'renda_bruta',
  'renda_media_3m',
  // Contato
  'telefone',
  'phone',
  'celular',
  'whatsapp',
  'whatsappE164',
  'email',
  'e_mail',
  // Texto de mensagem (conteúdo da conversa)
  'texto',
  'mensagem',
  'message',
  // Credenciais / segredos
  'senha',
  'senhaHash',
  'password',
  'passwordHash',
  'authorization',
  'apikey',
  'apiKey',
  'token',
  'secret',
];

/**
 * Gera os caminhos de `redact` do pino a partir das chaves sensíveis, cobrindo o
 * topo do objeto e alguns níveis de aninhamento (o pino/fast-redact suporta
 * wildcards intermediários como `*.cpf` e `*.*.cpf`).
 */
function construirRedactPaths(chaves: readonly string[]): string[] {
  const prefixos = ['', '*.', '*.*.', '*.*.*.'];
  const paths = new Set<string>();
  for (const chave of chaves) {
    for (const prefixo of prefixos) {
      paths.add(`${prefixo}${chave}`);
    }
  }
  return [...paths];
}

const NIVEL_PADRAO = process.env.LOG_LEVEL ?? 'info';

const baseOptions: LoggerOptions = {
  level: NIVEL_PADRAO,
  base: { service: 'sales-hub-api', role: process.env.PROCESS_ROLE ?? 'web' },
  redact: { paths: construirRedactPaths(CHAVES_SENSIVEIS), censor: CENSOR },
  formatters: {
    // Loga o nível como texto ("info") em vez do número — mais legível nos coletores.
    level: (label) => ({ level: label }),
  },
};

/** Fábrica de loggers (permite instância dedicada em testes/casos especiais). */
export function criarLogger(options: LoggerOptions = {}): Logger {
  return pino({ ...baseOptions, ...options });
}

/** Instância compartilhada da aplicação. */
export const logger: Logger = criarLogger();

/** Gera um correlation id novo (para amarrar logs de um mesmo fluxo/requisição). */
export function novoCorrelationId(): string {
  return randomUUID();
}

/**
 * Logger-filho carimbado com um correlation id. Se nenhum for passado, gera um —
 * assim todo fluxo que quiser correlação já tem um id disponível.
 */
export function comCorrelacao(correlationId?: string): Logger {
  return logger.child({ correlationId: correlationId ?? novoCorrelationId() });
}

const CHAVES_SENSIVEIS_LOWER = new Set(CHAVES_SENSIVEIS.map((c) => c.toLowerCase()));

/**
 * Varredura recursiva que substitui valores de chaves sensíveis por [REDACTED].
 * Rede de segurança para logs de objetos arbitrários (o `redact` já cobre o hot
 * path, mas isto protege estruturas fora dos caminhos previstos). Não muta a
 * entrada; devolve uma cópia saneada.
 */
export function scrub<T>(valor: T, _vistos = new WeakSet<object>()): T {
  if (valor === null || typeof valor !== 'object') return valor;
  if (_vistos.has(valor as object)) return valor; // evita ciclos
  _vistos.add(valor as object);

  if (Array.isArray(valor)) {
    return valor.map((item) => scrub(item, _vistos)) as unknown as T;
  }

  const saida: Record<string, unknown> = {};
  for (const [chave, val] of Object.entries(valor as Record<string, unknown>)) {
    if (CHAVES_SENSIVEIS_LOWER.has(chave.toLowerCase())) {
      saida[chave] = CENSOR;
    } else {
      saida[chave] = scrub(val, _vistos);
    }
  }
  return saida as unknown as T;
}
