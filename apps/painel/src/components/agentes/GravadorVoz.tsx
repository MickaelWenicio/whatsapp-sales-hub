'use client';

import { useEffect, useState } from 'react';
import { Mic, Square, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { classeFoco } from './comum';
import { OndaAnimada } from './Onda';
import { formatarTempo, type AmostraVoz } from './tipos';

const GRAVACAO_MAX_SEG = 120;

/**
 * Gravação apenas visual: não usa o microfone nem grava nada. Mostra uma onda simulada e um
 * cronômetro; ao parar, entrega uma amostra fictícia para o restante do fluxo.
 */
export function GravadorVoz({
  reduzido,
  onGravacao,
}: {
  reduzido: boolean;
  onGravacao: (amostra: AmostraVoz) => void;
}) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    if (!gravando) return;
    const t = window.setInterval(() => setSegundos((s) => Math.min(GRAVACAO_MAX_SEG, s + 1)), 1000);
    return () => window.clearInterval(t);
  }, [gravando]);

  function parar() {
    setGravando(false);
    const seg = Math.max(30, segundos);
    onGravacao({
      origem: 'gravacao',
      nome: `Gravação de ${formatarTempo(seg)}`,
      tamanhoBytes: seg * 16_000,
      duracaoSeg: seg,
    });
  }

  return (
    <div className="rounded-card border border-line bg-panel p-4">
      <div className="flex items-center gap-4">
        {gravando ? (
          <button
            type="button"
            onClick={parar}
            aria-label="Parar gravação"
            className={cn(
              'flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-emg-solid text-white transition-colors duration-[120ms] hover:bg-emg-fg',
              classeFoco,
            )}
          >
            <Square className="size-4 fill-current" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setSegundos(0);
              setGravando(true);
            }}
            aria-label="Começar a gravar"
            className={cn(
              'flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-noite text-white transition-colors duration-[120ms] hover:bg-noite-suave',
              classeFoco,
            )}
          >
            <Mic className="size-5" aria-hidden />
          </button>
        )}

        <div className="min-w-0 flex-1">
          {gravando ? (
            <>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="inline-flex items-center gap-2 font-semibold text-emg-fg">
                  <span
                    className={cn('size-2 rounded-full bg-emg-solid', !reduzido && 'animate-pulse')}
                    aria-hidden
                  />
                  Gravando
                </span>
                <span className="tabular font-semibold text-ink">
                  {formatarTempo(segundos)}
                  <span className="font-medium text-ink-3"> de {formatarTempo(GRAVACAO_MAX_SEG)}</span>
                </span>
              </div>
              <OndaAnimada semente="gravando" barras={64} reduzido={reduzido} className="mt-2 h-10 overflow-hidden" />
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-ink">Gravar agora</p>
              <p className="mt-0.5 text-[13px] text-ink-3">Toque no microfone e leia em voz alta.</p>
            </>
          )}
        </div>

        {gravando && (
          <Button
            type="button"
            variant="ghost"
            className="h-9 cursor-pointer text-ink-2"
            onClick={() => setGravando(false)}
          >
            <X />
            Descartar
          </Button>
        )}
      </div>
    </div>
  );
}
