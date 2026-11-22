'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { AudioLines, CircleAlert, MessageSquareText, Mic, PhoneCall } from 'lucide-react';
import { ehNumeroFicticio } from '@sales-hub/shared';
import { useNumeros } from '@/lib/queries';
import { formatarTelefone } from '@/lib/formatos';
import { cn } from '@/lib/utils';
import { CORES, iniciaisAgente, type CorAvatar } from './tipos';

/* ─── Número da operação (só leitura, mesmo critério da tela Conexões) ─────── */

export type NumeroOperacao = {
  carregando: boolean;
  erro: boolean;
  /** "+55 (82) 99435-7540" ou null quando não há número configurado. */
  numero: string | null;
  rotulo: string | null;
};

export function useNumeroOperacao(): NumeroOperacao {
  const q = useNumeros();
  const reais = q.data?.filter((n) => !n.ficticio) ?? [];
  // e164 de placeholder e não conectado = ainda não configurado
  const atual = reais.find((n) => !ehNumeroFicticio(n.e164) || n.estado === 'conectado') ?? null;
  return {
    carregando: q.isLoading,
    erro: q.isError,
    numero: atual ? atual.telefoneExibicao || formatarTelefone(atual.e164) : null,
    rotulo: atual?.rotulo ?? null,
  };
}

/* ─── Movimento reduzido ──────────────────────────────────────────────────── */

const CONSULTA_MOVIMENTO = '(prefers-reduced-motion: reduce)';
function assinarMovimento(aviso: () => void) {
  const mq = window.matchMedia(CONSULTA_MOVIMENTO);
  mq.addEventListener('change', aviso);
  return () => mq.removeEventListener('change', aviso);
}
export function useMovimentoReduzido(): boolean {
  return useSyncExternalStore(
    assinarMovimento,
    () => window.matchMedia(CONSULTA_MOVIMENTO).matches,
    () => false,
  );
}

/* ─── Campos ──────────────────────────────────────────────────────────────── */

export function CabecalhoEtapa({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="mb-6">
      <h3 className="font-display text-[17px] leading-6 font-semibold tracking-[-0.01em] text-ink">{titulo}</h3>
      <p className="mt-1 max-w-[68ch] text-sm text-ink-2">{descricao}</p>
    </div>
  );
}

export function ErroCampo({ id, children }: { id: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-2 flex items-start gap-1.5 text-[13px] leading-[18px] font-medium text-emg-fg">
      <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

/** Rótulo + controle + ajuda + erro, com espaçamento padrão do formulário. */
export function Campo({
  rotulo,
  htmlFor,
  ajuda,
  erro,
  erroId,
  opcional,
  extra,
  children,
  className,
}: {
  rotulo: string;
  htmlFor?: string;
  ajuda?: ReactNode;
  erro?: string;
  erroId?: string;
  opcional?: boolean;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
          {rotulo}
          {opcional && <span className="ml-1.5 font-medium text-ink-3">(opcional)</span>}
        </label>
        {extra}
      </div>
      {children}
      {ajuda && !erro && <p className="mt-2 text-[13px] leading-[18px] text-ink-3">{ajuda}</p>}
      {erroId && <ErroCampo id={erroId}>{erro}</ErroCampo>}
    </div>
  );
}

/** Classe dos inputs do assistente: borda de controle, foco Sinal, altura de 40px. */
export const classeInput =
  'h-10 rounded-control border-line-control bg-panel px-3 text-sm text-ink placeholder:text-ink-3 focus-visible:border-sinal focus-visible:ring-2 focus-visible:ring-sinal/35';

export const classeFoco =
  'outline-none focus-visible:ring-2 focus-visible:ring-sinal focus-visible:ring-offset-2 focus-visible:ring-offset-panel';

/* ─── Avatar e chips ──────────────────────────────────────────────────────── */

export function AvatarAgente({
  nome,
  cor,
  tamanho = 'md',
  className,
}: {
  nome: string;
  cor: CorAvatar;
  tamanho?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const c = CORES.find((x) => x.v === cor) ?? CORES[1]!;
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full border font-display font-semibold tracking-tight',
        {
          sm: 'size-8 text-xs',
          md: 'size-11 text-sm',
          lg: 'size-14 text-base',
        }[tamanho],
        c.avatar,
        className,
      )}
    >
      {iniciaisAgente(nome)}
    </span>
  );
}

export type Capacidade = 'texto' | 'audio' | 'ligacoes' | 'voz';
const CAPACIDADES: Record<Capacidade, { t: string; I: typeof Mic }> = {
  texto: { t: 'Texto', I: MessageSquareText },
  audio: { t: 'Áudio', I: AudioLines },
  ligacoes: { t: 'Ligações', I: PhoneCall },
  voz: { t: 'Voz clonada', I: Mic },
};

/** Ligado: fundo Sinal claro. Desligado: contorno tracejado e texto terciário (não depende só da cor). */
export function ChipCapacidade({ tipo, ativo }: { tipo: Capacidade; ativo: boolean }) {
  const { t, I } = CAPACIDADES[tipo];
  return (
    <span
      title={`${t}: ${ativo ? 'ligado' : 'desligado'}`}
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-chip border px-2 text-xs font-semibold',
        ativo ? 'border-ia-border bg-ia-bg text-ia-fg' : 'border-dashed border-line text-ink-3',
      )}
    >
      <I className="size-3.5" strokeWidth={1.75} aria-hidden />
      {t}
      <span className="sr-only">{ativo ? ', ligado' : ', desligado'}</span>
    </span>
  );
}
