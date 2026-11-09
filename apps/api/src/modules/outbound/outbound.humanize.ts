/**
 * Tempo de "digitando…" antes de entregar uma bolha da IA: proporcional ao tamanho
 * (~humano digitando), com jitter, sempre entre 2 s e 5 s.
 */
const MIN_DELAY_MS = 2_000;
const MAX_DELAY_MS = 5_000;

export function calcularDelayDigitando(texto: string): number {
  const base = (texto ?? '').length * 45 + Math.floor(Math.random() * 600);
  return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, base));
}
