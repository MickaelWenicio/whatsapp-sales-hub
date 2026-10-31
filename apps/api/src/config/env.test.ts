import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

const base = { DATABASE_URL: 'postgresql://localhost/x', REDIS_URL: 'redis://localhost:6379', AUTH_SECRET: 's' };

describe('validateEnv', () => {
  it('aplica defaults e trata vazio como ausente', () => {
    const env = validateEnv({ ...base, PROCESS_ROLE: '', DEMO_ALLOWED_NUMBERS: '' });
    expect(env.PROCESS_ROLE).toBe('web');
    expect(env.PORT).toBe(3311);
    expect(env.DEMO_MODE).toBe(false);
    expect(env.EMPRESA_NOME).toBe('Empresa Exemplo');
    expect(env.EMPRESA_DESCRICAO).toBe('Empresa de serviços por assinatura para pessoas e empresas.');
    expect(env.AGENT_TERMOS_PROIBIDOS).toBe('');
  });
  it('DEMO_MODE="false" não vira true', () => {
    expect(validateEnv({ ...base, DEMO_MODE: 'false' }).DEMO_MODE).toBe(false);
    expect(validateEnv({ ...base, DEMO_MODE: 'true' }).DEMO_MODE).toBe(true);
  });
  it('aborta sem DATABASE_URL', () => {
    expect(() => validateEnv({ REDIS_URL: 'r', AUTH_SECRET: 's' })).toThrow(/Configuração de ambiente inválida/);
  });
  it('em produção exige ADMIN_API_TOKEN e EVOLUTION_WEBHOOK_TOKEN', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(/ADMIN_API_TOKEN/);
    expect(() => validateEnv({ ...base, NODE_ENV: 'production', ADMIN_API_TOKEN: 't' })).toThrow(
      /EVOLUTION_WEBHOOK_TOKEN/,
    );
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', ADMIN_API_TOKEN: 't', EVOLUTION_WEBHOOK_TOKEN: 'w' }),
    ).not.toThrow();
  });
});
