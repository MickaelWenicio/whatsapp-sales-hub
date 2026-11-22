'use client';

import { createContext, useContext } from 'react';

type AcoesAssistente = {
  /** Envia um texto como se a pessoa tivesse digitado no campo. */
  enviar: (texto: string) => void;
  /** Abre o modal padrão de recurso em desenvolvimento. */
  emDesenvolvimento: (recurso: string, detalhe?: string) => void;
  /** O assistente está pensando ou escrevendo. */
  ocupado: boolean;
};

export const ContextoAssistente = createContext<AcoesAssistente | null>(null);

export function useAcoesAssistente(): AcoesAssistente {
  const ctx = useContext(ContextoAssistente);
  if (!ctx) throw new Error('useAcoesAssistente precisa estar dentro de <Assistente>.');
  return ctx;
}
