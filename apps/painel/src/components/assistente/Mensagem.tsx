'use client';

import { memo, useEffect, useState, type ReactNode } from 'react';
import { Check, Copy, RefreshCw, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ConteudoResposta } from './Blocos';
import { useAcoesAssistente } from './contexto';
import { textoPlano, type MensagemChat, type Resposta } from './respostas';

export function AvatarAssistente({
  trabalhando = false,
  className,
}: {
  trabalhando?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full bg-sinal text-white',
        trabalhando && 'pino-pulso',
        className,
      )}
    >
      <Sparkles className="size-4" strokeWidth={1.75} />
    </span>
  );
}

export function MensagemUsuario({ texto }: { texto: string }) {
  return (
    <div className="flex justify-end pl-10">
      <div className="max-w-[min(100%,36rem)] rounded-[12px] bg-chat px-4 py-2.5 text-[15px] leading-[22px] break-words whitespace-pre-wrap text-ink">
        <span className="sr-only">Você disse: </span>
        {texto}
      </div>
    </div>
  );
}

export const MensagemAssistente = memo(function MensagemAssistente({
  mensagem,
  visiveis,
  escrevendo,
}: {
  mensagem: Extract<MensagemChat, { autor: 'assistente' }>;
  /** palavras já escritas; `null` = resposta inteira */
  visiveis: number | null;
  escrevendo: boolean;
}) {
  const limite = visiveis ?? mensagem.interrompidaEm ?? null;
  const interrompida = mensagem.interrompidaEm !== undefined;
  const vazia = limite === 0;
  return (
    <div className="flex gap-4">
      <AvatarAssistente />
      <div className="min-w-0 flex-1 pt-[5px]">
        <span className="sr-only">O assistente respondeu: </span>
        {vazia ? null : (
          <ConteudoResposta
            resposta={mensagem.resposta}
            visiveis={limite}
            escrevendo={escrevendo}
          />
        )}
        {interrompida ? (
          <p className={cn('text-[13px] leading-[18px] font-medium text-ink-3', !vazia && 'mt-3')}>
            Resposta interrompida.
          </p>
        ) : null}
        {!escrevendo && !vazia ? (
          <AcoesDaMensagem resposta={mensagem.resposta} limite={limite} />
        ) : null}
      </div>
    </div>
  );
});

function BotaoIcone({
  rotulo,
  onClick,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={rotulo}
          onClick={onClick}
          className="grid size-8 place-items-center rounded-control text-ink-3 transition-colors duration-[120ms] outline-none hover:bg-chat hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{rotulo}</TooltipContent>
    </Tooltip>
  );
}

/** Copia por Clipboard API e, fora de contexto seguro (painel servido por IP), pelo método antigo. */
async function copiarTexto(texto: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(texto);
    return;
  }
  const area = document.createElement('textarea');
  area.value = texto;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(area);
  if (!ok) throw new Error('cópia recusada');
}

function AcoesDaMensagem({ resposta, limite }: { resposta: Resposta; limite: number | null }) {
  const { emDesenvolvimento } = useAcoesAssistente();
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const t = window.setTimeout(() => setCopiado(false), 2000);
    return () => window.clearTimeout(t);
  }, [copiado]);

  async function copiar() {
    try {
      await copiarTexto(textoPlano(resposta, limite));
      setCopiado(true);
      toast.success('Resposta copiada.');
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e copie manualmente.');
    }
  }

  const avaliar = () =>
    emDesenvolvimento(
      'Avaliar respostas',
      'Na próxima fase, a sua avaliação ajuda a ajustar o assistente às respostas que a operação considera úteis.',
    );

  return (
    <div className="-ml-1.5 mt-3 flex items-center gap-0.5">
      <BotaoIcone rotulo={copiado ? 'Copiado' : 'Copiar'} onClick={() => void copiar()}>
        {copiado ? (
          <Check className="text-hum-fg" strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Copy strokeWidth={1.75} aria-hidden="true" />
        )}
      </BotaoIcone>
      <BotaoIcone rotulo="Boa resposta" onClick={avaliar}>
        <ThumbsUp strokeWidth={1.75} aria-hidden="true" />
      </BotaoIcone>
      <BotaoIcone rotulo="Resposta ruim" onClick={avaliar}>
        <ThumbsDown strokeWidth={1.75} aria-hidden="true" />
      </BotaoIcone>
      <BotaoIcone
        rotulo="Gerar de novo"
        onClick={() => emDesenvolvimento('Gerar a resposta de novo')}
      >
        <RefreshCw strokeWidth={1.75} aria-hidden="true" />
      </BotaoIcone>
    </div>
  );
}

/** Estado "pensando": avatar pulsando, pontos e a etapa que o assistente está consultando. */
export function Pensando({ status }: { status: string }) {
  return (
    <div className="flex items-center gap-4">
      <AvatarAssistente trabalhando />
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="assistente-ponto size-1.5 rounded-full bg-sinal"
              style={{ animationDelay: `${i * 160}ms` }}
            />
          ))}
        </span>
        <span className="text-sm font-medium text-ink-3">{status}</span>
      </div>
    </div>
  );
}
