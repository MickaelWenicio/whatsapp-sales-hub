'use client';

import { useLayoutEffect, useState, type KeyboardEvent, type RefObject } from 'react';
import { ArrowUp, Paperclip, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

const ALTURA_LINHA = 22;
const MAX_LINHAS = 8;
/** pt-3.5 + pb-1 do textarea */
const RESPIRO_VERTICAL = 18;

export function Composer({
  textareaRef,
  ocupado,
  onEnviar,
  onParar,
  onAnexar,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  ocupado: boolean;
  onEnviar: (texto: string) => void;
  onParar: () => void;
  onAnexar: () => void;
}) {
  const [texto, setTexto] = useState('');
  const vazio = texto.trim().length === 0;

  // Cresce com o conteúdo até 8 linhas; depois disso, rola por dentro.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const maximo = ALTURA_LINHA * MAX_LINHAS + RESPIRO_VERTICAL;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maximo)}px`;
    el.style.overflowY = el.scrollHeight > maximo ? 'auto' : 'hidden';
  }, [texto, textareaRef]);

  function enviar() {
    if (vazio || ocupado) return;
    onEnviar(texto.trim());
    setTexto('');
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    enviar();
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
        className="rounded-panel border border-line bg-panel transition-[border-color,box-shadow] duration-[160ms] has-[textarea:focus-visible]:border-sinal has-[textarea:focus-visible]:ring-3 has-[textarea:focus-visible]:ring-sinal/20"
      >
        <label htmlFor="assistente-mensagem" className="sr-only">
          Mensagem para o assistente
        </label>
        <textarea
          id="assistente-mensagem"
          ref={textareaRef}
          rows={1}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={aoTeclar}
          placeholder="Peça um relatório, procure leads ou ajuste o funil"
          aria-describedby="assistente-dica"
          className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-[22px] text-ink outline-none placeholder:text-ink-3"
        />
        <span id="assistente-dica" className="sr-only">
          Enter envia. Shift e Enter quebram a linha.
        </span>
        <div className="flex items-center justify-between gap-2 px-2.5 pt-1 pb-2.5">
          <button
            type="button"
            onClick={onAnexar}
            className="inline-flex h-9 items-center gap-1.5 rounded-control px-2.5 text-sm font-medium text-ink-2 transition-colors duration-[120ms] outline-none hover:bg-chat hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Paperclip className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Anexar
          </button>
          {ocupado ? (
            <button
              type="button"
              onClick={onParar}
              aria-label="Parar resposta"
              className="grid size-9 place-items-center rounded-full bg-noite text-white transition-colors duration-[120ms] outline-none hover:bg-noite-suave focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2"
            >
              <Square className="size-3.5 fill-current" strokeWidth={1.75} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={vazio}
              aria-label="Enviar mensagem"
              className={cn(
                'grid size-9 place-items-center rounded-full transition-colors duration-[120ms] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2',
                vazio ? 'bg-sunken text-ink-disabled' : 'bg-noite text-white hover:bg-noite-suave',
              )}
            >
              <ArrowUp className="size-[18px]" strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
      </form>
      <p className="mt-2 text-center text-xs leading-4 font-medium text-ink-3">
        O assistente pode cometer erros. Confira as informações importantes.
      </p>
    </div>
  );
}
