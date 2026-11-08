import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Marca cabeçalhos de seção cujos números vêm da base fictícia de demonstração. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full border border-esp-border bg-esp-bg px-2 text-xs font-semibold text-esp-fg',
        className,
      )}
    >
      <FlaskConical className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
      Dados de demonstração
    </span>
  );
}
