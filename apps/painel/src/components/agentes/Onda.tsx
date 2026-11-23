'use client';

import { cn } from '@/lib/utils';

// Barras da forma de onda. Fica aqui para não mexer no CSS global por causa de uma tela.
const CSS_ONDA = `
@keyframes agente-onda {
  0%, 100% { transform: scaleY(.25); }
  50% { transform: scaleY(1); }
}
.agente-onda-barra { animation: agente-onda 1.1s var(--ease-standard) infinite; }
@media (prefers-reduced-motion: reduce) {
  .agente-onda-barra { animation: none; transform: scaleY(.55); }
}
`;

/** Alturas determinísticas (0 a 1) com envelope de fala, para a mesma amostra sempre desenhar a mesma onda. */
export function alturasOnda(semente: string, n: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < semente.length; i++) h = Math.imul(h ^ semente.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const r = ((h >>> 0) % 1000) / 1000;
    const envelope = 0.3 + 0.7 * Math.sin((Math.PI * (i + 0.5)) / n);
    out.push(Math.max(0.12, Math.min(1, envelope * (0.3 + 0.7 * r))));
  }
  return out;
}

/** Onda parada: resultado da voz clonada e estados com movimento reduzido. */
export function OndaEstatica({
  semente,
  barras = 56,
  className,
  corBarra = 'bg-sinal',
}: {
  semente: string;
  barras?: number;
  className?: string;
  corBarra?: string;
}) {
  const alturas = alturasOnda(semente, barras);
  return (
    <div aria-hidden className={cn('flex h-12 items-center gap-[2px]', className)}>
      {alturas.map((a, i) => (
        <span
          key={i}
          className={cn('w-[3px] shrink-0 rounded-full', corBarra)}
          style={{ height: `${Math.round(a * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** Onda pulsando enquanto a voz é gerada. Com movimento reduzido, fica parada. */
export function OndaAnimada({
  semente,
  barras = 40,
  reduzido,
  className,
}: {
  semente: string;
  barras?: number;
  reduzido: boolean;
  className?: string;
}) {
  if (reduzido) return <OndaEstatica semente={semente} barras={barras} className={className} corBarra="bg-ia-border" />;
  const alturas = alturasOnda(semente, barras);
  return (
    <div aria-hidden className={cn('flex h-12 items-center gap-[2px]', className)}>
      <style href="agente-onda" precedence="default">
        {CSS_ONDA}
      </style>
      {alturas.map((a, i) => (
        <span
          key={i}
          className="agente-onda-barra w-[3px] shrink-0 rounded-full bg-sinal"
          style={{ height: `${Math.round(a * 100)}%`, animationDelay: `${(i % 12) * -90}ms` }}
        />
      ))}
    </div>
  );
}
