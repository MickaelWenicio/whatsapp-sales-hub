import { describe, expect, it } from 'vitest';
import { EventoTempoRealSchema } from './eventos';

describe('EventoTempoRealSchema', () => {
  const em = new Date().toISOString();
  it('aceita eventos válidos', () => {
    expect(EventoTempoRealSchema.safeParse({ id: '1', tipo: 'agent.typing', payload: { conversationId: 'c', ativo: true }, em }).success).toBe(true);
    expect(EventoTempoRealSchema.safeParse({ id: '2', tipo: 'settings.updated', payload: { chave: 'iaGlobalAtiva' }, em }).success).toBe(true);
    expect(
      EventoTempoRealSchema.safeParse({ id: '3', tipo: 'message.created', payload: { conversationId: 'c', mensagem: { id: 'm', conversationId: 'c' } }, em }).success,
    ).toBe(true);
  });
  it('rejeita payload vazio, tipo desconhecido e data inválida', () => {
    expect(EventoTempoRealSchema.safeParse({ id: '1', tipo: 'agent.typing', payload: {}, em: 'x' }).success).toBe(false);
    expect(EventoTempoRealSchema.safeParse({ id: '1', tipo: 'agent.typing', payload: {}, em }).success).toBe(false);
    expect(EventoTempoRealSchema.safeParse({ id: '1', tipo: 'nada', payload: {}, em }).success).toBe(false);
    expect(EventoTempoRealSchema.safeParse({ id: '1', tipo: 'settings.updated', payload: { chave: 'x' }, em: 'x' }).success).toBe(false);
  });
});
