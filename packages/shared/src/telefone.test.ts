import { describe, expect, it } from 'vitest';
import { ehNumeroFicticio, formatarTelefoneBr, formatarTelefoneExibicao, mesmoNumero, normalizarTelefoneBr } from './telefone';

describe('normalizarTelefoneBr', () => {
  it('celular com DDD sem país → +55…', () => {
    expect(normalizarTelefoneBr('48991041186')).toBe('+5548991041186');
  });

  it('formato humano com pontuação → normaliza', () => {
    expect(normalizarTelefoneBr('(48) 99104-1186')).toBe('+5548991041186');
    expect(normalizarTelefoneBr('48 99104 1186')).toBe('+5548991041186');
  });

  it('já com país (55…) → mantém', () => {
    expect(normalizarTelefoneBr('5548991041186')).toBe('+5548991041186');
    expect(normalizarTelefoneBr('+55 48 99104-1186')).toBe('+5548991041186');
  });

  it('fixo (10 dígitos com DDD) → +55…', () => {
    expect(normalizarTelefoneBr('4832221111')).toBe('+554832221111');
  });

  it('prefixo internacional 00 → remove', () => {
    expect(normalizarTelefoneBr('005548991041186')).toBe('+5548991041186');
  });

  it('sem DDD (9 dígitos) → null (não dá pra rotear)', () => {
    expect(normalizarTelefoneBr('991041186')).toBeNull();
  });

  it('internacional explícito não-BR → null (não coage estrangeiro em BR)', () => {
    expect(normalizarTelefoneBr('+1 202 555 0173')).toBeNull();
    expect(normalizarTelefoneBr('001 202 555 0173')).toBeNull();
  });

  it('celular de 11 dígitos que não começa com 9 → null', () => {
    expect(normalizarTelefoneBr('48891041186')).toBeNull();
  });

  it('lixo / vazio → null', () => {
    expect(normalizarTelefoneBr('')).toBeNull();
    expect(normalizarTelefoneBr(null)).toBeNull();
    expect(normalizarTelefoneBr('abc')).toBeNull();
    expect(normalizarTelefoneBr('123')).toBeNull();
  });
});

// specs #13 / P3: o telefone da ficha vem do WhatsApp da conversa — precisa sair legível
// para quem lê a ficha (Larissa, Alude, dossiê).
describe('formatarTelefoneBr', () => {
  it('E.164 de celular → (DD) 9XXXX-XXXX', () => {
    expect(formatarTelefoneBr('+5548991041186')).toBe('(48) 99104-1186');
  });

  it('fixo (8 dígitos) → (DD) XXXX-XXXX', () => {
    expect(formatarTelefoneBr('+554833334444')).toBe('(48) 3333-4444');
  });

  it('entrada não-BR/ilegível volta intacta (não inventa formato)', () => {
    expect(formatarTelefoneBr('+12025550173')).toBe('+12025550173');
    expect(formatarTelefoneBr('')).toBe('');
    expect(formatarTelefoneBr(null)).toBe('');
  });
});

describe('mesmoNumero', () => {
  it('compara pela forma normalizada', () => {
    expect(mesmoNumero('48991041186', '+55 48 99104-1186')).toBe(true);
    expect(mesmoNumero('48991041186', '48991041187')).toBe(false);
    expect(mesmoNumero(null, '48991041186')).toBe(false);
  });

  it('celular BR com e sem o 9 (JID do WhatsApp) é o mesmo número', () => {
    expect(mesmoNumero('+558294357540', '+5582994357540')).toBe(true);
    expect(mesmoNumero('558294357540', '+55 82 99435-7540')).toBe(true);
    expect(mesmoNumero('+558194357540', '+5582994357540')).toBe(false);
    expect(mesmoNumero('+558294357541', '+5582994357540')).toBe(false);
  });
});

describe('ehNumeroFicticio / formatarTelefoneExibicao', () => {
  it('faixa +55 00 9xxxx-xxxx é fictícia', () => {
    expect(ehNumeroFicticio('+5500912345678')).toBe(true);
    expect(ehNumeroFicticio('+5511987654321')).toBe(false);
  });
  it('fictício é exibido com DDD 11', () => {
    expect(formatarTelefoneExibicao('+5500912345678')).toBe('+55 (11) 91234-5678');
  });
  it('real é exibido com +55 e DDD', () => {
    expect(formatarTelefoneExibicao('+5511987654321')).toBe('+55 (11) 98765-4321');
    expect(formatarTelefoneExibicao('lixo')).toBe('lixo');
  });
});
