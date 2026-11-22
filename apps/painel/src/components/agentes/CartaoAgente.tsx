'use client';

import type { ReactNode } from 'react';
import { FlaskConical, MessageCircle, Pause, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AvatarAgente, ChipCapacidade, type Capacidade } from './comum';
import type { CorAvatar } from './tipos';

export type StatusCartao = 'ativo' | 'simulacao' | 'pausado';

export function StatusAgente({ status }: { status: StatusCartao }) {
  if (status === 'ativo')
    return (
      <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hum-border bg-hum-bg px-2 text-xs font-semibold text-hum-fg">
        <span className="size-1.5 rounded-full bg-hum-solid" aria-hidden />
        Ativo
      </span>
    );
  if (status === 'pausado')
    return (
      <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-pau-border bg-pau-bg px-2 text-xs font-semibold text-pau-fg">
        <Pause className="size-3" strokeWidth={2.25} aria-hidden />
        Pausado
      </span>
    );
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-line bg-chat px-2 text-xs font-semibold text-ink-2">
      <FlaskConical className="size-3.5 text-sinal" strokeWidth={1.75} aria-hidden />
      Simulação
    </span>
  );
}

export function CartaoAgente({
  nome,
  funcao,
  descricao,
  cor,
  numero,
  status,
  capacidades,
  rodape,
  menu,
  onAbrir,
  rotuloAbrir,
}: {
  nome: string;
  funcao: string;
  descricao: string;
  cor: CorAvatar;
  numero: string | null;
  status: StatusCartao;
  capacidades: Record<Capacidade, boolean>;
  rodape?: ReactNode;
  menu?: ReactNode;
  /** O cartão inteiro vira um botão (padrão "stretched link"), sem botões aninhados. */
  onAbrir?: () => void;
  rotuloAbrir?: string;
}) {
  return (
    <article
      className={cn(
        'relative flex flex-col rounded-card border border-line bg-panel p-4 transition-colors duration-[120ms] ease-standard',
        onAbrir &&
          'hover:border-line-control has-[[data-cartao-abrir]:focus-visible]:ring-2 has-[[data-cartao-abrir]:focus-visible]:ring-sinal has-[[data-cartao-abrir]:focus-visible]:ring-offset-2',
        status === 'pausado' && 'bg-canvas',
      )}
    >
      <div className="flex items-start gap-3">
        <AvatarAgente nome={nome} cor={cor} />
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-[15px] leading-5 font-bold text-ink">
            {onAbrir ? (
              <button
                type="button"
                data-cartao-abrir
                onClick={onAbrir}
                aria-label={rotuloAbrir}
                className="cursor-pointer text-left outline-none after:absolute after:inset-0 after:rounded-card"
              >
                {nome}
              </button>
            ) : (
              nome
            )}
          </h4>
          <p className="mt-0.5 truncate text-[13px] text-ink-3">{funcao}</p>
        </div>
        <StatusAgente status={status} />
        {menu && <div className="relative -mt-1 -mr-1">{menu}</div>}
      </div>

      <p className="mt-3 line-clamp-2 min-h-11 text-sm leading-[22px] break-words text-ink-2">{descricao}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle className="size-3.5 text-ink-3" strokeWidth={1.75} aria-hidden />
          WhatsApp
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Smartphone className="size-3.5 text-ink-3" strokeWidth={1.75} aria-hidden />
          {numero ? (
            <span className="tabular font-semibold text-ink">{numero}</span>
          ) : (
            <span className="text-ink-3">Nenhum número configurado</span>
          )}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line-subtle pt-3">
        <ChipCapacidade tipo="texto" ativo={capacidades.texto} />
        <ChipCapacidade tipo="audio" ativo={capacidades.audio} />
        <ChipCapacidade tipo="ligacoes" ativo={capacidades.ligacoes} />
        <ChipCapacidade tipo="voz" ativo={capacidades.voz} />
      </div>
      {rodape && <div className="mt-3 text-xs text-ink-3">{rodape}</div>}
    </article>
  );
}
