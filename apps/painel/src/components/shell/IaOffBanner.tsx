'use client';

import { Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIaGlobal } from '@/lib/queries';
import { podeControlarIa, useAlternarIaGlobal } from '@/lib/ia-global';

/** Faixa âmbar abaixo da barra superior quando a IA está desligada para toda a operação. */
export function IaOffBanner({ papel }: { papel: string }) {
  const { data } = useIaGlobal();
  const alternar = useAlternarIaGlobal();
  if (data?.ativa !== false) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b border-pau-border bg-pau-bg px-6 py-2.5 text-sm text-pau-fg"
    >
      <Pause className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <p className="flex-1 font-medium">
        A IA está desligada para toda a operação. Nenhuma resposta automática será enviada.
      </p>
      {podeControlarIa(papel) ? (
        <Button size="sm" onClick={() => alternar.mutate(true)} disabled={alternar.isPending}>
          Religar IA
        </Button>
      ) : null}
    </div>
  );
}
