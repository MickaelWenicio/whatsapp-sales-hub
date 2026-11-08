/** PRNG determinístico (mulberry32). O gerador nunca usa Math.random nem Date.now. */
export function criarPrng(semente: number) {
  let a = semente >>> 0;
  const proximo = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** Inteiro em [min, max], inclusive. */
  const int = (min: number, max: number): number => min + Math.floor(proximo() * (max - min + 1));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(proximo() * xs.length)]!;
  const chance = (p: number): boolean => proximo() < p;
  const shuffle = <T>(xs: readonly T[]): T[] => {
    const r = [...xs];
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(proximo() * (i + 1));
      [r[i], r[j]] = [r[j]!, r[i]!];
    }
    return r;
  };
  /** Escolha ponderada: pares [valor, peso]. */
  const pesos = <T>(xs: ReadonlyArray<readonly [T, number]>): T => {
    const total = xs.reduce((s, [, p]) => s + p, 0);
    let r = proximo() * total;
    for (const [v, p] of xs) {
      r -= p;
      if (r < 0) return v;
    }
    return xs[xs.length - 1]![0];
  };
  const entre = (min: number, max: number): number => min + proximo() * (max - min);
  return { proximo, int, pick, chance, shuffle, pesos, entre };
}

export type Prng = ReturnType<typeof criarPrng>;
