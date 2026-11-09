import { describe, expect, it } from 'vitest';
import { calcularDelayDigitando } from './outbound.humanize';

describe('calcularDelayDigitando', () => {
  it('fica sempre entre 2 s e 5 s', () => {
    for (const texto of ['', 'Oi', 'x'.repeat(60), 'x'.repeat(500)]) {
      for (let i = 0; i < 50; i++) {
        const d = calcularDelayDigitando(texto);
        expect(d).toBeGreaterThanOrEqual(2000);
        expect(d).toBeLessThanOrEqual(5000);
      }
    }
  });

  it('cresce com o tamanho do texto', () => {
    expect(calcularDelayDigitando('x'.repeat(500))).toBe(5000);
    expect(calcularDelayDigitando('Oi')).toBe(2000);
  });
});
