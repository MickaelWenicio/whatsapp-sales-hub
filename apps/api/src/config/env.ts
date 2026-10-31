import { z } from 'zod';
import { AGENT_MODEL_PADRAO, EFFORTS, EMPRESA_DESCRICAO_PADRAO, EMPRESA_NOME_PADRAO } from './claude';

const booleano = (padrao: boolean) =>
  z
    .preprocess((v) => (v === undefined ? undefined : v === 'true' || v === '1' || v === true), z.boolean())
    .default(padrao);

/** Contrato de variáveis de ambiente. O boot ABORTA com mensagem clara se algo obrigatório faltar. */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PROCESS_ROLE: z.enum(['web', 'worker']).default('web'),
    PORT: z.coerce.number().int().positive().default(3311),
    APP_BASE_URL: z.string().default('http://localhost:3311'),
    DATABASE_URL: z.string().min(1, 'obrigatório'),
    REDIS_URL: z.string().min(1, 'obrigatório'),
    AGENT_DEBOUNCE_MS: z.coerce.number().int().positive().default(8000),
    AGENT_DEBOUNCE_MAX_MS: z.coerce.number().int().positive().default(45_000),
    AGENT_HISTORICO_MAX: z.coerce.number().int().positive().default(40),
    AGENT_MODEL: z.string().default(AGENT_MODEL_PADRAO),
    AGENT_EFFORT: z.enum(EFFORTS).default('low'),
    ANTHROPIC_API_KEY: z.string().default(''),
    /** Lista separada por vírgulas de termos que o agente não pode usar (padrão: nenhum). */
    AGENT_TERMOS_PROIBIDOS: z.string().default(''),
    EMPRESA_NOME: z.string().default(EMPRESA_NOME_PADRAO),
    EMPRESA_DESCRICAO: z.string().default(EMPRESA_DESCRICAO_PADRAO),
    CHANNEL_CONNECTOR: z.enum(['evolution']).default('evolution'),
    EVOLUTION_API_URL: z.string().default(''),
    EVOLUTION_API_KEY: z.string().default(''),
    EVOLUTION_INSTANCE: z.string().default('sales-hub'),
    EVOLUTION_WEBHOOK_TOKEN: z.string().default(''),
    ADMIN_API_TOKEN: z.string().default(''),
    AUTH_SECRET: z.string().min(1, 'obrigatório'),
    PII_ENCRYPTION_ENABLED: booleano(false),
    PII_ENCRYPTION_KEY: z.string().default(''),
    DEMO_MODE: booleano(false),
    DEMO_ALLOWED_NUMBERS: z.string().default(''),
    NUMERO_AGENTE_E164: z.string().default(''),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (!env.ADMIN_API_TOKEN) {
      ctx.addIssue({ code: 'custom', path: ['ADMIN_API_TOKEN'], message: 'obrigatório em produção' });
    }
    if (!env.EVOLUTION_WEBHOOK_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['EVOLUTION_WEBHOOK_TOKEN'],
        message: 'obrigatório em produção (webhook não pode ficar aberto)',
      });
    }
    if (env.PII_ENCRYPTION_ENABLED) {
      if (!env.PII_ENCRYPTION_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['PII_ENCRYPTION_KEY'],
          message: 'obrigatório em produção quando PII_ENCRYPTION_ENABLED=true',
        });
      } else if (!/^[0-9a-fA-F]{64}$/.test(env.PII_ENCRYPTION_KEY)) {
        ctx.addIssue({
          code: 'custom',
          path: ['PII_ENCRYPTION_KEY'],
          message: 'deve ser 32 bytes em hex (64 chars); gerar com openssl rand -hex 32',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Valida `process.env` (usada pelo ConfigModule.forRoot). Variáveis vazias valem como ausentes. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const limpo = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== ''));
  const parsed = envSchema.safeParse(limpo);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${issues}`);
  }
  return parsed.data;
}
