'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useIaGlobal } from '@/lib/queries';
import { podeControlarIa, useAlternarIaGlobal } from '@/lib/ia-global';

/** Interruptor "IA da operação". Desligar pede confirmação; só dono e gestor alteram. */
export function KillSwitch({ papel }: { papel: string }) {
  const { data } = useIaGlobal();
  const alternar = useAlternarIaGlobal();
  const [confirmando, setConfirmando] = useState(false);
  const pode = podeControlarIa(papel);
  const ativa = data?.ativa;

  function aoMudar(proxima: boolean) {
    if (proxima) alternar.mutate(true);
    else setConfirmando(true);
  }

  if (!pode) return null; // só dono e gestor veem o interruptor

  return (
    <>
      <label className="flex items-center gap-2 text-sm font-medium text-ink-2">
        <span>
          IA na demonstração:{' '}
          {ativa === undefined ? (
            <span className="inline-block h-3.5 w-14 animate-pulse rounded bg-line-control align-middle" />
          ) : (
            <span
              className={ativa === false ? 'font-semibold text-pau-fg' : 'font-semibold text-ink'}
            >
              {ativa ? 'ligada' : 'desligada'}
            </span>
          )}
        </span>
        {ativa === undefined ? (
          <span className="h-5 w-9 animate-pulse rounded-full bg-line-control" aria-hidden="true" />
        ) : (
        <Switch
          checked={ativa === true}
          disabled={ativa === undefined || alternar.isPending}
          onCheckedChange={aoMudar}
          aria-label="IA da operação"
        />
        )}
      </label>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desligar a IA para toda a operação?</AlertDialogTitle>
            <AlertDialogDescription>
              Nenhuma resposta automática será enviada em nenhuma conversa até você religar. As
              mensagens dos clientes continuam chegando e a equipe atende manualmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => alternar.mutate(false)}>
              Desligar IA
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
