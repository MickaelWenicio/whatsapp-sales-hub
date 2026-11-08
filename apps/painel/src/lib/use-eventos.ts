'use client';

import { useEffect, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  EventoTempoRealSchema,
  type ConversaDetalheDTO,
  type ConversaItemDTO,
  type EventoTempoReal,
  type MensagemDTO,
  type OportunidadeCardDTO,
  type TrilhaItemDTO,
} from '@sales-hub/shared';
import { chaves } from './queries';

/** Listas de conversas podem estar em cache como `{ itens }` ou como infinite query `{ pages }`. */
type ComItens<T> = { itens: T[] };
type Paginas<T> = { pages: ComItens<T>[]; pageParams: unknown[] };

function mapItens<T>(dados: unknown, fn: (itens: T[], indicePagina: number) => T[]): unknown {
  if (!dados || typeof dados !== 'object') return dados;
  if ('itens' in dados && Array.isArray((dados as ComItens<T>).itens)) {
    const d = dados as ComItens<T>;
    return { ...d, itens: fn(d.itens, 0) };
  }
  if ('pages' in dados && Array.isArray((dados as Paginas<T>).pages)) {
    const d = dados as Paginas<T>;
    return { ...d, pages: d.pages.map((p, i) => ({ ...p, itens: fn(p.itens, i) })) };
  }
  return dados;
}

function upsertConversa(qc: QueryClient, conversa: ConversaItemDTO) {
  // Atualiza onde já existe; em "todas" sem busca, uma conversa nova entra no topo.
  qc.setQueriesData({ queryKey: ['conversas'] }, (dados: unknown) => mapItens<ConversaItemDTO>(dados, (itens) => {
    if (itens.some((c) => c.id === conversa.id)) {
      return itens.map((c) => (c.id === conversa.id ? conversa : c));
    }
    return itens;
  }));
  const listaTodas = qc.getQueryData(chaves.conversas('todas', ''));
  if (listaTodas) {
    qc.setQueryData(chaves.conversas('todas', ''), (dados: unknown) =>
      mapItens<ConversaItemDTO>(dados, (itens, pagina) =>
        pagina === 0 && !itens.some((c) => c.id === conversa.id) ? [conversa, ...itens] : itens,
      ),
    );
  }
  qc.setQueryData<ConversaDetalheDTO>(chaves.conversa(conversa.id), (d) =>
    d ? { ...d, conversa } : d,
  );
  // reconcilia ordenação e filtros no servidor
  qc.invalidateQueries({ queryKey: ['conversas'] });
  qc.invalidateQueries({ queryKey: chaves.naoLidas() });
}

function aplicar(qc: QueryClient, ev: EventoTempoReal) {
  switch (ev.tipo) {
    case 'message.created': {
      const { conversationId, mensagem } = ev.payload;
      qc.setQueryData(chaves.mensagens(conversationId), (dados: unknown) =>
        mapItens<MensagemDTO>(dados, (itens, pagina) =>
          pagina === 0 && !itens.some((m) => m.id === mensagem.id) ? [...itens, mensagem] : itens,
        ),
      );
      qc.invalidateQueries({ queryKey: ['conversas'] });
      qc.invalidateQueries({ queryKey: chaves.naoLidas() });
      return;
    }
    case 'message.updated': {
      const { conversationId, mensagemId, status, motivoFalha } = ev.payload;
      qc.setQueryData(chaves.mensagens(conversationId), (dados: unknown) =>
        mapItens<MensagemDTO>(dados, (itens) =>
          itens.map((m) => (m.id === mensagemId ? { ...m, status, motivoFalha: motivoFalha ?? null } : m)),
        ),
      );
      return;
    }
    case 'conversation.updated':
      upsertConversa(qc, ev.payload.conversa);
      return;
    case 'agent.typing':
      qc.setQueryData(chaves.digitando(ev.payload.conversationId), ev.payload.ativo);
      return;
    case 'agent.action': {
      const { conversationId, item } = ev.payload;
      qc.setQueryData<TrilhaItemDTO[]>(chaves.trilha(conversationId), (lista) =>
        lista && !lista.some((t) => t.id === item.id) ? [...lista, item] : lista,
      );
      return;
    }
    case 'summary.updated':
      qc.invalidateQueries({ queryKey: chaves.conversa(ev.payload.conversationId) });
      return;
    case 'opportunity.updated': {
      const card = ev.payload.oportunidade;
      qc.setQueriesData({ queryKey: ['oportunidades'] }, (dados: unknown) => {
        if (!dados || typeof dados !== 'object') return dados;
        const colunas = dados as Record<string, OportunidadeCardDTO[]>;
        const novo: Record<string, OportunidadeCardDTO[]> = {};
        for (const [etapa, cards] of Object.entries(colunas)) {
          if (!Array.isArray(cards)) return dados;
          novo[etapa] = cards.filter((c) => c.id !== card.id);
        }
        novo[card.etapa] = [card, ...(novo[card.etapa] ?? [])];
        return novo;
      });
      qc.invalidateQueries({ queryKey: ['visao-geral'] });
      return;
    }
    case 'task.updated':
      qc.invalidateQueries({ queryKey: ['conversa'] });
      qc.invalidateQueries({ queryKey: ['visao-geral'] });
      return;
    case 'number.status':
      qc.invalidateQueries({ queryKey: chaves.numeros() });
      return;
    case 'settings.updated':
      qc.invalidateQueries({ queryKey: chaves.iaGlobal() });
      return;
  }
}

const ESPERA_MAX_MS = 15_000;

/**
 * Conecta no stream SSE (`/api/stream`), valida cada envelope com zod e escreve no cache do
 * React Query. Reconecta sozinho (com espera crescente) e, ao voltar de uma queda, invalida tudo.
 * Montar uma vez, no layout do app.
 */
export function useEventosAoVivo(): { conectado: boolean } {
  const qc = useQueryClient();
  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let encerrado = false;
    let caiu = false;
    let tentativas = 0;

    const conectar = () => {
      if (encerrado) return;
      es = new EventSource('/api/stream');

      es.onopen = () => {
        tentativas = 0;
        setConectado(true);
        if (caiu) {
          caiu = false;
          // pode ter perdido eventos durante a queda
          qc.invalidateQueries();
        }
      };

      es.onmessage = (e: MessageEvent<string>) => {
        let bruto: unknown;
        try {
          bruto = JSON.parse(e.data);
        } catch {
          return;
        }
        const r = EventoTempoRealSchema.safeParse(bruto);
        if (r.success) aplicar(qc, r.data);
      };

      es.onerror = () => {
        setConectado(false);
        caiu = true;
        // Resposta não-200 fecha o EventSource sem reconexão automática: recriamos à mão.
        if (es && es.readyState === EventSource.CLOSED) {
          es.close();
          es = null;
          void verificarSessaoERecriar();
        }
      };
    };

    // EventSource não expõe o status HTTP: sonda um GET leve para distinguir sessão expirada
    // (vai para /login e para de tentar) de queda de rede ou da API (tenta de novo).
    const verificarSessaoERecriar = async () => {
      try {
        const r = await fetch('/api/bff/ia-global', { cache: 'no-store', credentials: 'same-origin' });
        if (r.status === 401) {
          encerrado = true;
          window.location.assign('/login');
          return;
        }
        if (r.status === 403) {
          // logado, mas sem permissão: não adianta tentar de novo nem ir ao login
          encerrado = true;
          setConectado(false);
          return;
        }
      } catch {
        // sem rede: segue para a nova tentativa
      }
      if (encerrado) return;
      tentativas += 1;
      const espera = Math.min(1000 * 2 ** (tentativas - 1), ESPERA_MAX_MS);
      timer = setTimeout(conectar, espera);
    };

    conectar();
    return () => {
      encerrado = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [qc]);

  return { conectado };
}
