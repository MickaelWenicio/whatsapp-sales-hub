import { describe, expect, it } from 'vitest';
import { decidirTurno, type EstadoTurno } from './turno';

const AGORA = 1_000_000_000_000;
const base: EstadoTurno = {
  agora: AGORA,
  ultimaEntradaEm: null,
  ultimaSaidaEm: null,
  entradaMaisAntigaNaoRespondidaEm: null,
  debounceMs: 3000,
  maxEsperaMs: 20_000,
};

describe('decidirTurno (debounce por contato)', () => {
  it('sem mensagem recebida → nada', () => {
    expect(decidirTurno(base)).toBe('nada');
  });

  it('silêncio >= debounce → roda', () => {
    expect(
      decidirTurno({ ...base, ultimaEntradaEm: AGORA - 3000, entradaMaisAntigaNaoRespondidaEm: AGORA - 3000 }),
    ).toBe('rodar');
  });

  it('mensagem recente (silêncio < debounce) → aguarda (lead ainda pode estar digitando)', () => {
    expect(
      decidirTurno({ ...base, ultimaEntradaEm: AGORA - 1500, entradaMaisAntigaNaoRespondidaEm: AGORA - 5000 }),
    ).toBe('aguardar');
  });

  it('job de mensagem anterior vê entrada mais nova → aguarda (só o da última roda)', () => {
    // Este job foi agendado p/ a msg A (AGORA-3000), mas B chegou depois (AGORA-2000).
    expect(
      decidirTurno({ ...base, ultimaEntradaEm: AGORA - 2000, entradaMaisAntigaNaoRespondidaEm: AGORA - 3000 }),
    ).toBe('aguardar');
  });

  it('teto de espera estourado (lead manda sem parar) → roda mesmo sem silêncio', () => {
    expect(
      decidirTurno({
        ...base,
        ultimaEntradaEm: AGORA - 2000, // ainda "digitando"
        entradaMaisAntigaNaoRespondidaEm: AGORA - 20_000, // mas já espera há 20s
      }),
    ).toBe('rodar');
  });

  it('já respondido (última saída >= última entrada) → nada', () => {
    expect(
      decidirTurno({
        ...base,
        ultimaEntradaEm: AGORA - 20_000,
        ultimaSaidaEm: AGORA - 10_000,
        entradaMaisAntigaNaoRespondidaEm: null,
      }),
    ).toBe('nada');
  });

  it('respondeu antes, mas chegou entrada nova após a saída → roda quando em silêncio', () => {
    expect(
      decidirTurno({
        ...base,
        ultimaEntradaEm: AGORA - 3000, // nova pergunta após a resposta
        ultimaSaidaEm: AGORA - 30_000, // resposta anterior
        entradaMaisAntigaNaoRespondidaEm: AGORA - 3000,
      }),
    ).toBe('rodar');
  });
});
