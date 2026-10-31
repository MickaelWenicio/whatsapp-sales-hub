import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { getAgentConfig } from './claude';

const cfg = (m: Record<string, unknown>) => ({ get: (k: string) => m[k] }) as unknown as ConfigService;

describe('getAgentConfig', () => {
  it('lê modelo, esforço e histórico', () => {
    expect(getAgentConfig(cfg({ AGENT_MODEL: 'm', AGENT_EFFORT: 'high', AGENT_HISTORICO_MAX: '12' }))).toEqual({
      model: 'm',
      effort: 'high',
      historicoMax: 12,
    });
  });
  it('usa defaults e rejeita esforço inválido', () => {
    expect(getAgentConfig(cfg({ AGENT_EFFORT: 'x' }))).toEqual({
      model: 'claude-opus-5-5',
      effort: 'low',
      historicoMax: 40,
    });
  });
});
