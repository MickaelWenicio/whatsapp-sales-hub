import { describe, expect, it } from 'vitest';
import { FERRAMENTAS, definicoesFerramentas } from './definicoes';

type Schema = { type?: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean; items?: Schema };

/** Palavras-chave que o modo strict não aceita (a API devolveria 400). */
const PROIBIDAS = ['minLength', 'maxLength', 'minimum', 'maximum', 'multipleOf', 'minItems', 'maxItems', 'pattern', '$schema'];

function percorrer(s: Schema, visita: (s: Schema) => void): void {
  visita(s);
  for (const p of Object.values(s.properties ?? {})) percorrer(p, visita);
  if (s.items) percorrer(s.items, visita);
}

describe('definições das ferramentas', () => {
  const defs = definicoesFerramentas();

  it('tem todas as ferramentas da Fase 1, na ordem fixa', () => {
    expect(defs.map((d) => d.name)).toEqual([
      'responder',
      'atualizar_contato',
      'registrar_item',
      'registrar_interesse',
      'mover_etapa',
      'registrar_objecao',
      'solicitar_cotacao',
      'sinalizar_intencao',
      'transferir_para_humano',
      'sinalizar_emergencia',
      'registrar_interrupcao',
    ]);
  });

  it('strict, eager_input_streaming, additionalProperties false em todo objeto e justificativa obrigatória', () => {
    for (const d of defs) {
      expect(d.strict, d.name).toBe(true);
      expect(d.eager_input_streaming, d.name).toBe(true);
      const schema = d.input_schema as Schema;
      percorrer(schema, (s) => {
        if (s.type === 'object') expect(s.additionalProperties, d.name).toBe(false);
        for (const k of PROIBIDAS) expect(Object.keys(s), `${d.name}.${k}`).not.toContain(k);
      });
      expect(schema.required, d.name).toContain('justificativa');
      for (const r of schema.required ?? []) expect(Object.keys(schema.properties ?? {}), d.name).toContain(r);
      // ids nunca vêm do modelo
      for (const k of ['conversationId', 'contactId', 'mensagemOrigemId']) expect(Object.keys(schema.properties ?? {})).not.toContain(k);
    }
  });

  it('zod valida limites que o JSON schema não expressa', () => {
    const r = FERRAMENTAS.responder.schema;
    expect(r.safeParse({ mensagens: ['oi'], justificativa: 'ok' }).success).toBe(true);
    expect(r.safeParse({ mensagens: [], justificativa: 'ok' }).success).toBe(false);
    expect(r.safeParse({ mensagens: ['a', 'b', 'c', 'd', 'e'], justificativa: 'ok' }).success).toBe(false);
    expect(r.safeParse({ mensagens: ['x'.repeat(501)], justificativa: 'ok' }).success).toBe(false);
    expect(r.safeParse({ mensagens: ['oi'], justificativa: 'j'.repeat(201) }).success).toBe(false);
    expect(r.safeParse({ mensagens: ['oi'], justificativa: 'ok', extra: 1 }).success).toBe(false);
    const item = FERRAMENTAS.registrar_item.schema;
    expect(item.safeParse({ categoria: 'Empresa pequena', quantidade: 15, justificativa: 'ok' }).success).toBe(true);
    expect(item.safeParse({ quantidade: 0, justificativa: 'ok' }).success).toBe(false);
    expect(item.safeParse({ quantidade: 2.5, justificativa: 'ok' }).success).toBe(false);
    expect(item.safeParse({ tipo: 'nave', justificativa: 'ok' }).success).toBe(false);
    expect(FERRAMENTAS.registrar_interesse.schema.safeParse({ preocupacao: 'qualidade', justificativa: 'ok' }).success).toBe(true);
    expect(FERRAMENTAS.registrar_interesse.schema.safeParse({ preocupacao: 'inexistente', justificativa: 'ok' }).success).toBe(false);
  });
});
