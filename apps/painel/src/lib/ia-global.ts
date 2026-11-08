'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { bff } from './bff';
import { chaves } from './queries';

/** Liga ou desliga a IA para toda a operação, com atualização otimista e aviso. */
export function useAlternarIaGlobal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ativa: boolean) => bff.post<{ ativa: boolean }>('ia-global', { ativa }),
    onMutate: async (ativa) => {
      await qc.cancelQueries({ queryKey: chaves.iaGlobal() });
      const antes = qc.getQueryData<{ ativa: boolean }>(chaves.iaGlobal());
      qc.setQueryData(chaves.iaGlobal(), { ativa });
      return { antes };
    },
    onError: (e, _ativa, ctx) => {
      qc.setQueryData(chaves.iaGlobal(), ctx?.antes);
      toast.error(`Não foi possível alterar a IA. ${e instanceof Error ? e.message : ''}`.trim());
    },
    onSuccess: (_r, ativa) => {
      toast.success(
        ativa ? 'IA religada. As respostas automáticas voltam a ser enviadas.' : 'IA desligada para toda a operação.',
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: chaves.iaGlobal() }),
  });
}

export function podeControlarIa(papel: string | undefined): boolean {
  return papel === 'dono' || papel === 'gestor';
}
