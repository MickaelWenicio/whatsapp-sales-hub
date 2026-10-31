import { timingSafeEqual } from 'node:crypto';

/** Comparação de segredos em tempo constante (evita timing side-channel). */
export function compararSegredo(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
