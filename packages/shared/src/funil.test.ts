import { describe, expect, it } from 'vitest';
import { exigeEvidencia, exigeMotivo, podeMover } from './funil';

describe('funil', () => {
  it('regras de movimento', () => {
    expect(podeMover('novo_lead', 'aguardando_cotacao', 'ia')).toEqual({ ok: true });
    expect(podeMover('em_negociacao', 'venda_confirmada', 'ia').ok).toBe(false);
    expect(podeMover('em_negociacao', 'venda_confirmada', 'humano')).toEqual({ ok: true });
    expect(podeMover('aguardando_cotacao', 'qualificacao_concluida', 'humano')).toEqual({ ok: true });
    expect(podeMover('aguardando_cotacao', 'em_atendimento', 'humano').ok).toBe(false);
    expect(podeMover('perdido', 'em_atendimento', 'humano')).toEqual({ ok: true });
    expect(podeMover('em_atendimento', 'proposta_enviada', 'ia').ok).toBe(false);
    expect(podeMover('em_atendimento', 'proposta_enviada', 'sistema')).toEqual({ ok: true });
    expect(podeMover('em_atendimento', 'perdido', 'ia')).toEqual({ ok: true });
    expect(podeMover('em_atendimento', 'novo_lead', 'humano').ok).toBe(false);
    expect(podeMover('em_atendimento', 'novo_lead', 'sistema')).toEqual({ ok: true });
  });
  it('nada sai de venda_confirmada exceto humano voltando uma etapa', () => {
    expect(podeMover('venda_confirmada', 'contratacao_em_andamento', 'humano')).toEqual({ ok: true });
    expect(podeMover('venda_confirmada', 'contratacao_em_andamento', 'ia').ok).toBe(false);
    expect(podeMover('venda_confirmada', 'perdido', 'humano').ok).toBe(false);
    expect(podeMover('venda_confirmada', 'em_negociacao', 'humano').ok).toBe(false);
  });
  it('mesma etapa e perdido só volta para em_atendimento', () => {
    expect(podeMover('novo_lead', 'novo_lead', 'sistema').ok).toBe(false);
    expect(podeMover('perdido', 'novo_lead', 'sistema').ok).toBe(false);
  });
  it('exigências', () => {
    expect(exigeMotivo('perdido')).toBe(true);
    expect(exigeMotivo('em_negociacao')).toBe(false);
    expect(exigeEvidencia('venda_confirmada')).toBe(true);
    expect(exigeEvidencia('perdido')).toBe(false);
  });
});
