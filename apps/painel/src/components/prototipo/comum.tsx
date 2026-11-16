'use client';

import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DemoBadge } from '@/components/shell/DemoBadge';

export const nomes = [
  'Mariana Oliveira',
  'Carlos Eduardo',
  'Rafael Santos',
  'Juliana Costa',
  'Lucas Ferreira',
  'Fernanda Lima',
];
/** Interesse de cada contato fictício: produto do catálogo e o detalhe informado. */
export const interesses = [
  { produto: 'Plano Essencial', detalhe: 'Uso individual' },
  { produto: 'Plano Completo', detalhe: 'Família de 4 pessoas' },
  { produto: 'Plano Essencial', detalhe: '2 unidades' },
  { produto: 'Soluções para Empresas', detalhe: 'Equipe de 15 pessoas' },
  { produto: 'Plano Completo', detalhe: 'Uso individual' },
  { produto: 'Soluções para Empresas', detalhe: '3 filiais' },
];

export function Page({
  title,
  description,
  action,
  children,
  demo = true,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
  demo?: boolean;
}) {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-[26px] leading-9 font-semibold tracking-tight text-ink">
              {title}
            </h2>
            {demo && <DemoBadge />}
          </div>
          <p className="max-w-[72ch] text-sm text-ink-2">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
export function Panel({
  title,
  subtitle,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-panel border border-line bg-panel', className)}>
      {title && (
        <div className="border-b border-line-subtle px-5 py-4">
          <h3 className="text-[15px] font-bold text-ink">{title}</h3>
          {subtitle && <p className="mt-1 text-xs text-ink-3">{subtitle}</p>}
        </div>
      )}
      {children}
    </section>
  );
}
export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'blue' | 'green' | 'amber' | 'purple';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold',
        {
          neutral: 'bg-chat text-ink-2',
          blue: 'bg-ia-bg text-ia-fg',
          green: 'bg-hum-bg text-hum-fg',
          amber: 'bg-pau-bg text-pau-fg',
          purple: 'bg-esp-bg text-esp-fg',
        }[tone],
      )}
    >
      {children}
    </span>
  );
}
export function DemoNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-card border border-esp-border bg-esp-bg px-4 py-3 text-sm text-esp-fg">
      <Info className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
export function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex-1 border-r border-line-subtle px-5 py-4 last:border-r-0">
      <div className="text-xs font-medium text-ink-3">{label}</div>
      <div className="my-1 font-display text-[28px] font-semibold tabular-nums text-ink">
        {value}
      </div>
      <div className="text-xs text-ink-3">{detail}</div>
    </div>
  );
}
