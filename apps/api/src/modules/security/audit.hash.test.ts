import { describe, expect, it } from 'vitest';
import { calcularHashAuditoria, type CamposAuditoria } from './audit.hash';

const e1: CamposAuditoria = {
  ator: 'agente',
  acao: 'salvar_campo_ficha',
  entidade: 'locatario',
  entidadeId: 'l1',
  createdAt: '2026-07-03T10:00:00.000Z',
};
const e2: CamposAuditoria = {
  ator: 'usuario_painel',
  acao: 'aprovar',
  entidade: 'attendance',
  entidadeId: 'a1',
  createdAt: '2026-07-03T11:00:00.000Z',
};

describe('calcularHashAuditoria', () => {
  it('é determinística', () => {
    expect(calcularHashAuditoria(null, e1)).toBe(calcularHashAuditoria(null, e1));
  });

  it('encadeia (o hash do 2º depende do 1º)', () => {
    const h1 = calcularHashAuditoria(null, e1);
    const h2a = calcularHashAuditoria(h1, e2);
    const h2b = calcularHashAuditoria('outro-hash', e2);
    expect(h2a).not.toBe(h2b); // muda o anterior → muda o hash
  });

  it('detecta adulteração de qualquer campo', () => {
    const h1 = calcularHashAuditoria(null, e1);
    expect(calcularHashAuditoria(null, { ...e1, acao: 'outra' })).not.toBe(h1);
    expect(calcularHashAuditoria(null, { ...e1, entidadeId: 'l2' })).not.toBe(h1);
    expect(calcularHashAuditoria(null, { ...e1, createdAt: '2026-07-03T10:00:01.000Z' })).not.toBe(h1);
  });
});
