'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { useMovimentoReduzido, type NumeroOperacao } from './comum';
import { EtapaIdentidade } from './etapas/Identidade';
import { EtapaCanal } from './etapas/Canal';
import { EtapaVozChamadas } from './etapas/VozChamadas';
import { EtapaComportamento } from './etapas/Comportamento';
import { EtapaRevisao } from './etapas/Revisao';
import { CAMPO_DO_ERRO, ETAPAS, validarEtapa, type Alterar, type RascunhoAgente } from './tipos';

const ULTIMA = ETAPAS.length - 1;

/**
 * Assistente de criação (e edição) de agente, em 5 etapas. Cabeçalho, etapas e rodapé ficam
 * fixos; só o corpo rola, para caber em 1280×720.
 */
export function NovoAgente({
  aberto,
  inicial,
  editando,
  operacao,
  onFechar,
  onSalvar,
}: {
  aberto: boolean;
  inicial: RascunhoAgente;
  editando: boolean;
  operacao: NumeroOperacao;
  onFechar: () => void;
  onSalvar: (r: RascunhoAgente) => void;
}) {
  const [r, setR] = useState<RascunhoAgente>(inicial);
  const [inicialJson] = useState(() => JSON.stringify(inicial));
  const [etapa, setEtapa] = useState(0);
  const [alcancada, setAlcancada] = useState(editando ? ULTIMA : 0);
  const [tentou, setTentou] = useState<boolean[]>(() => ETAPAS.map(() => false));
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const corpoRef = useRef<HTMLDivElement>(null);
  const focoPendente = useRef<string | null>(null);
  const reduzido = useMovimentoReduzido();

  const ctx = { temNumeroOperacao: operacao.carregando || !!operacao.numero };
  const erros = validarEtapa(etapa, r, ctx);
  const sujo = JSON.stringify(r) !== inicialJson;

  const alterar: Alterar = useCallback(
    (p) => setR((prev) => ({ ...prev, ...(typeof p === 'function' ? p(prev) : p) })),
    [],
  );


  // Nova etapa começa do topo; depois, se faltou algo, o foco vai para o primeiro campo com erro.
  useEffect(() => {
    corpoRef.current?.scrollTo({ top: 0 });
  }, [etapa]);
  useEffect(() => {
    const id = focoPendente.current;
    if (!id) return;
    focoPendente.current = null;
    const el = document.getElementById(id);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'center', behavior: reduzido ? 'auto' : 'smooth' });
  });

  /** Para na primeira etapa inválida entre `de` e `ate` (exclusivo). Devolve true se todas passaram. */
  function conferir(de: number, ate: number): boolean {
    for (let i = de; i < ate; i++) {
      const chaves = Object.keys(validarEtapa(i, r, ctx));
      if (chaves.length > 0) {
        setTentou((t) => t.map((x, j) => (j === i ? true : x)));
        setEtapa(i);
        focoPendente.current = CAMPO_DO_ERRO[chaves[0]!] ?? null;
        return false;
      }
    }
    return true;
  }

  function irPara(destino: number) {
    if (destino < 0 || destino > ULTIMA || destino === etapa) return;
    if (destino < etapa) return setEtapa(destino);
    if (!conferir(etapa, destino)) return;
    setEtapa(destino);
    setAlcancada((a) => Math.max(a, destino));
  }

  function fechar() {
    onFechar();
  }

  function pedirFechar() {
    if (sujo) setConfirmarSaida(true);
    else fechar();
  }

  function salvar() {
    if (!conferir(0, ULTIMA)) return;
    onSalvar(r);
  }

  return (
    <>
      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          if (!v) pedirFechar();
        }}
      >
        <DialogContent
          className="flex h-[min(760px,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[720px]"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            document.getElementById('agente-nome')?.focus();
          }}
        >
          {/* Cabeçalho e etapas: fixos */}
          <div className="shrink-0 border-b border-line-subtle px-6 pt-5 pb-4">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-card border border-ia-border bg-ia-bg text-sinal">
                  <Bot className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <DialogTitle className="font-display text-lg leading-6">
                    {editando ? 'Editar agente' : 'Novo agente de WhatsApp'}
                  </DialogTitle>
                  <DialogDescription className="text-[13px] leading-[18px] text-ink-3">
                    Etapa {etapa + 1} de {ETAPAS.length}. O agente fica em modo simulação no protótipo.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <nav aria-label="Etapas do agente" className="mt-5">
              <ol className="flex items-center gap-2">
                {ETAPAS.map((t, i) => {
                  const atual = i === etapa;
                  const concluida = !atual && i < alcancada;
                  const clicavel = !atual && i <= alcancada;
                  return (
                    <li key={t} className="flex min-w-0 flex-auto items-center gap-2 last:flex-none">
                      <button
                        type="button"
                        onClick={() => irPara(i)}
                        disabled={!clicavel}
                        aria-current={atual ? 'step' : undefined}
                        className={cn(
                          'flex min-w-0 items-center gap-2 rounded-control py-1 pr-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-sinal focus-visible:ring-offset-2 disabled:cursor-default',
                          clicavel && 'cursor-pointer hover:bg-canvas',
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular transition-colors duration-[160ms] ease-standard',
                            atual
                              ? 'border-sinal bg-sinal text-white'
                              : concluida
                                ? 'border-hum-border bg-hum-bg text-hum-fg'
                                : 'border-line bg-panel text-ink-3',
                          )}
                        >
                          {concluida ? <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> : i + 1}
                        </span>
                        <span
                          className={cn(
                            'hidden truncate text-[13px] sm:block',
                            atual ? 'font-bold text-ink' : concluida ? 'font-semibold text-ink-2' : 'font-semibold text-ink-3',
                          )}
                        >
                          {t}
                          {concluida && <span className="sr-only">, concluída</span>}
                        </span>
                      </button>
                      {i < ULTIMA && (
                        <span
                          aria-hidden
                          className={cn(
                            'h-px min-w-2 flex-1 transition-colors duration-[220ms] ease-standard',
                            i < alcancada ? 'bg-hum-border' : 'bg-line',
                          )}
                        />
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          </div>

          <p className="sr-only" aria-live="polite">
            Etapa {etapa + 1} de {ETAPAS.length}: {ETAPAS[etapa]}
          </p>

          {/* Corpo: só ele rola */}
          {/* relative: elementos absolutos (sr-only) ficam contidos aqui e não fazem a casca do diálogo rolar */}
          <div ref={corpoRef} className="relative min-h-0 flex-1 overflow-y-auto px-6 py-6 [scrollbar-gutter:stable]">
            {etapa === 0 && (
              <EtapaIdentidade r={r} alterar={alterar} erros={erros} mostrarErros={tentou[0]!} />
            )}
            {etapa === 1 && (
              <EtapaCanal r={r} alterar={alterar} erros={erros} mostrarErros={tentou[1]!} operacao={operacao} />
            )}
            {etapa === 2 && (
              <EtapaVozChamadas
                r={r}
                alterar={alterar}
                erros={erros}
                mostrarErros={tentou[2]!}
                reduzido={reduzido}
              />
            )}
            {etapa === 3 && (
              <EtapaComportamento r={r} alterar={alterar} erros={erros} mostrarErros={tentou[3]!} />
            )}
            {etapa === 4 && <EtapaRevisao r={r} numeroOperacao={operacao.numero} irPara={irPara} />}
          </div>

          {/* Rodapé: fixo */}
          <div className="flex shrink-0 items-center justify-between gap-3 rounded-b-panel border-t border-line-subtle bg-canvas px-6 py-4">
            <Button type="button" variant="ghost" className="h-10 cursor-pointer px-3 text-ink-2" onClick={pedirFechar}>
              Cancelar
            </Button>
            <div className="flex gap-2">
              {etapa > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 cursor-pointer bg-panel px-4"
                  onClick={() => irPara(etapa - 1)}
                >
                  Voltar
                </Button>
              )}
              {etapa < ULTIMA ? (
                <Button type="button" className="h-10 cursor-pointer px-5" onClick={() => irPara(etapa + 1)}>
                  Continuar
                </Button>
              ) : (
                <Button type="button" className="h-10 cursor-pointer px-5" onClick={salvar}>
                  <Check />
                  {editando ? 'Salvar alterações' : 'Criar agente'}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarSaida} onOpenChange={setConfirmarSaida}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[17px] font-semibold text-ink">
              {editando ? 'Descartar as alterações?' : 'Descartar o novo agente?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-ink-2">
              {editando
                ? 'As mudanças feitas neste agente não serão salvas.'
                : 'As informações preenchidas até aqui serão perdidas.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 cursor-pointer">Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="h-9 cursor-pointer"
              onClick={() => {
                setConfirmarSaida(false);
                fechar();
              }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
