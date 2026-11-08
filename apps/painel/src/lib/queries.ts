'use client';

import { useQuery } from '@tanstack/react-query';
import type { FiltroConversas, NumeroDTO, ListaConversasDTO } from '@sales-hub/shared';
import { bff } from './bff';

/** Chaves de query. O tempo real (`use-eventos.ts`) escreve nestas mesmas chaves. */
export const chaves = {
  conversas: (filtro: FiltroConversas | string = 'todas', busca = '') => ['conversas', filtro, busca] as const,
  conversa: (id: string) => ['conversa', id] as const,
  mensagens: (id: string) => ['mensagens', id] as const,
  trilha: (id: string) => ['trilha', id] as const,
  oportunidades: (filtros: unknown = {}) => ['oportunidades', filtros] as const,
  visaoGeral: (periodo: number | string = 30) => ['visao-geral', periodo] as const,
  numeros: () => ['numeros'] as const,
  iaGlobal: () => ['ia-global'] as const,
  /** "IA escrevendo": boolean por conversa, escrito pelo evento `agent.typing`. */
  digitando: (id: string) => ['digitando', id] as const,
  /** Contador de conversas não lidas da navegação. */
  naoLidas: () => ['nao-lidas'] as const,
};

export function useIaGlobal() {
  return useQuery({
    queryKey: chaves.iaGlobal(),
    queryFn: () => bff.get<{ ativa: boolean }>('ia-global'),
  });
}

export function useNumeros() {
  return useQuery({
    queryKey: chaves.numeros(),
    queryFn: () => bff.get<NumeroDTO[]>('numeros'),
  });
}

/** Quantidade de conversas com mensagens não lidas (até 50). */
export function useNaoLidas() {
  return useQuery({
    queryKey: chaves.naoLidas(),
    queryFn: async () => {
      const r = await bff.get<ListaConversasDTO>('conversas?filtro=nao_lidas&limite=50');
      return r.itens.length;
    },
  });
}
