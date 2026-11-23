'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import {
  Check,
  FileAudio,
  Info,
  LoaderCircle,
  Mic,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  Volume2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ErroCampo, classeFoco } from './comum';
import { EmDesenvolvimentoDialog } from '@/components/ui/em-desenvolvimento';
import { GravadorVoz } from './GravadorVoz';
import { OndaAnimada, OndaEstatica } from './Onda';
import {
  formatarBytes,
  formatarTempo,
  type AmostraVoz,
  type Erros,
  type RascunhoAgente,
} from './tipos';

type Clonar = RascunhoAgente['clonar'];

const EXTENSOES = ['mp3', 'wav', 'm4a', 'ogg'];
const ACCEPT = '.mp3,.wav,.m4a,.ogg,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/ogg';
const TAMANHO_MAX = 20 * 1024 * 1024;
const PASSOS_GERACAO = ['Analisando a amostra', 'Treinando a voz', 'Pronto'];
/** Momento (ms) em que cada passo começa; a geração termina em ~3 s. */
const TEMPOS_GERACAO = [0, 1200, 2500, 3100];

export function ClonagemVoz({
  clonar,
  setClonar,
  erros,
  mostrarErros,
  reduzido,
}: {
  clonar: Clonar;
  setClonar: (p: Partial<Clonar>) => void;
  erros: Erros;
  mostrarErros: boolean;
  reduzido: boolean;
}) {
  const [modo, setModo] = useState<'arquivo' | 'gravar'>('arquivo');
  const [erroArquivo, setErroArquivo] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const [geracao, setGeracao] = useState<number | null>(null);
  const [previa, setPrevia] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultadoRef = useRef<HTMLDivElement>(null);
  // Lista estável (mutada no lugar) para a limpeza ao desmontar enxergar os timers vivos.
  const [timers] = useState<number[]>(() => []);

  // Ao sair da etapa ou fechar o assistente: para a geração simulada e a prévia falada.
  useEffect(
    () => () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.length = 0;
    },
    [timers],
  );

  // O cartão de geração (e depois o resultado) é mais alto que o botão: traz para a tela.
  const mostrarResultado = () =>
    requestAnimationFrame(() =>
      resultadoRef.current?.scrollIntoView({ block: 'nearest', behavior: reduzido ? 'auto' : 'smooth' }),
    );

  const amostra = clonar.amostra;
  const erro = (k: string) => (mostrarErros ? erros[k] : undefined);

  function usarAmostra(a: AmostraVoz) {
    setClonar({ amostra: a, vozGerada: false });
    setErroArquivo('');
  }

  function trocarAmostra() {
    setClonar({ amostra: null, vozGerada: false });
  }

  function lerArquivo(f: File | undefined) {
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!EXTENSOES.includes(ext)) {
      setErroArquivo('Formato não aceito. Envie um arquivo MP3, WAV, M4A ou OGG.');
      return;
    }
    if (f.size === 0) {
      setErroArquivo('O arquivo está vazio. Escolha outra gravação.');
      return;
    }
    if (f.size > TAMANHO_MAX) {
      setErroArquivo('O arquivo passa de 20 MB. Envie uma gravação menor.');
      return;
    }
    // Só nome e tamanho: o arquivo não é lido nem enviado para lugar nenhum.
    usarAmostra({ origem: 'arquivo', nome: f.name, tamanhoBytes: f.size, duracaoSeg: null });
  }

  function aoSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    lerArquivo(e.dataTransfer.files?.[0]);
  }

  function escolherModo(m: 'arquivo' | 'gravar') {
    setModo(m);
  }

  function gerar() {
    if (!amostra || !clonar.consentimento || geracao !== null) return;
    timers.forEach((t) => window.clearTimeout(t));
    timers.length = 0;
    setGeracao(0);
    mostrarResultado();
    timers.push(
      window.setTimeout(() => setGeracao(1), TEMPOS_GERACAO[1]),
      window.setTimeout(() => setGeracao(2), TEMPOS_GERACAO[2]),
      window.setTimeout(() => {
        timers.length = 0;
        setGeracao(null);
        setClonar({ vozGerada: true });
        mostrarResultado();
      }, TEMPOS_GERACAO[3]),
    );
  }


  const semente = amostra ? `${amostra.nome}-${amostra.tamanhoBytes}` : 'voz';

  return (
    <div className="space-y-5">
      {/* Amostra */}
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-ink">Amostra da voz</span>
          <span className="text-xs font-medium text-ink-3">Fica só neste navegador. Nada é enviado.</span>
        </div>
        <p className="mb-3 flex items-start gap-2 text-[13px] leading-[18px] text-ink-2">
          <Info className="mt-px size-3.5 shrink-0 text-ink-3" aria-hidden />
          Grave de 30 segundos a 2 minutos, em ambiente silencioso, lendo um texto natural.
        </p>

        <div id="agente-amostra" tabIndex={-1} className="outline-none">
          {amostra ? (
            <div className="rounded-card border border-line bg-panel p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-card bg-chat text-ink-2">
                  {amostra.origem === 'gravacao' ? (
                    <Mic className="size-5" aria-hidden />
                  ) : (
                    <FileAudio className="size-5" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{amostra.nome}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-ink-3">
                    <span>{amostra.origem === 'gravacao' ? 'Gravada agora' : 'Arquivo enviado'}</span>
                    <span className="tabular">{formatarBytes(amostra.tamanhoBytes)}</span>
                    {amostra.duracaoSeg !== null && (
                      <span className="tabular">{formatarTempo(amostra.duracaoSeg)} de áudio</span>
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 cursor-pointer text-ink-2"
                  onClick={trocarAmostra}
                  disabled={geracao !== null}
                >
                  <RotateCcw />
                  Trocar amostra
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div
                role="group"
                aria-label="Como enviar a amostra"
                className="mb-3 inline-flex rounded-control border border-line bg-canvas p-1"
              >
                {(
                  [
                    ['arquivo', 'Enviar gravação', Upload],
                    ['gravar', 'Gravar agora', Mic],
                  ] as const
                ).map(([v, t, I]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={modo === v}
                    onClick={() => escolherModo(v)}
                    className={cn(
                      'inline-flex h-8 cursor-pointer items-center gap-2 rounded-chip px-3 text-sm font-semibold transition-colors duration-[120ms]',
                      modo === v ? 'bg-panel text-ink shadow-e1' : 'text-ink-3 hover:text-ink',
                      classeFoco,
                    )}
                  >
                    <I className="size-4" aria-hidden />
                    {t}
                  </button>
                ))}
              </div>

              {modo === 'arquivo' ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setArrastando(true);
                  }}
                  onDragLeave={() => setArrastando(false)}
                  onDrop={aoSoltar}
                  className={cn(
                    'flex flex-col items-center rounded-card border-2 border-dashed px-6 py-7 text-center transition-colors duration-[120ms]',
                    arrastando ? 'border-sinal bg-ia-bg' : 'border-line bg-canvas',
                  )}
                >
                  <span className="flex size-11 items-center justify-center rounded-full border border-line bg-panel text-ink-2">
                    <Upload className="size-5" aria-hidden />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-ink">Arraste o arquivo de áudio para cá</p>
                  <p className="mt-1 text-[13px] text-ink-3">MP3, WAV, M4A ou OGG, até 20 MB.</p>
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPT}
                    className="hidden"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => {
                      lerArquivo(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 h-9 cursor-pointer bg-panel"
                    onClick={() => inputRef.current?.click()}
                  >
                    <FileAudio />
                    Escolher arquivo
                  </Button>
                </div>
              ) : (
                <GravadorVoz reduzido={reduzido} onGravacao={usarAmostra} />
              )}
              <ErroCampo id="agente-arquivo-erro">{erroArquivo}</ErroCampo>
            </>
          )}
        </div>
        <ErroCampo id="agente-amostra-erro">{erro('amostra')}</ErroCampo>
      </div>

      {/* Consentimento */}
      <div
        className={cn(
          'rounded-card border p-4',
          erro('consentimento') ? 'border-emg-border bg-emg-bg/40' : 'border-line bg-canvas',
        )}
      >
        <div className="flex items-start gap-3">
          <Checkbox
            id="agente-consentimento"
            className="mt-0.5 size-[18px] cursor-pointer"
            checked={clonar.consentimento}
            disabled={geracao !== null}
            aria-invalid={!!erro('consentimento')}
            aria-describedby={erro('consentimento') ? 'agente-consentimento-erro' : undefined}
            onCheckedChange={(v) => {
              const ok = v === true;
              setClonar(ok ? { consentimento: true } : { consentimento: false, vozGerada: false });
            }}
          />
          <label htmlFor="agente-consentimento" className="cursor-pointer text-sm leading-[22px] text-ink">
            <span className="font-semibold">
              Confirmo que tenho autorização da pessoa dona desta voz para usá-la no agente.
            </span>
            <span className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-3">
              <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
              Obrigatório para usar a amostra.
            </span>
          </label>
        </div>
        <ErroCampo id="agente-consentimento-erro">{erro('consentimento')}</ErroCampo>
      </div>

      {/* Geração e resultado */}
      <p className="sr-only" aria-live="polite">
        {geracao !== null ? PASSOS_GERACAO[geracao] : clonar.vozGerada ? 'Voz clonada pronta.' : ''}
      </p>
      {amostra && clonar.consentimento && (
        <div ref={resultadoRef} className="scroll-mb-4">
          {geracao !== null ? (
            <div className="rounded-card border border-ia-border bg-ia-bg/50 p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-ia-fg">Gerando a voz clonada</p>
                <span className="text-xs font-semibold text-ia-fg">Simulação</span>
              </div>
              <OndaAnimada semente={semente} barras={72} reduzido={reduzido} className="mt-4 h-12 justify-center overflow-hidden" />
              <div className="mt-4 h-1 overflow-hidden rounded-full bg-panel" aria-hidden>
                <div
                  className="h-full rounded-full bg-sinal transition-[width] duration-[1200ms] ease-linear"
                  style={{ width: `${[38, 82, 100][geracao]}%` }}
                />
              </div>
              <ol className="mt-4 grid gap-2 sm:grid-cols-3">
                {PASSOS_GERACAO.map((p, i) => {
                  const feito = i < geracao || (i === 2 && geracao === 2);
                  const atual = i === geracao && i !== 2;
                  return (
                    <li
                      key={p}
                      className={cn(
                        'flex items-center gap-2 text-[13px] font-semibold',
                        feito ? 'text-hum-fg' : atual ? 'text-ia-fg' : 'text-ink-3',
                      )}
                    >
                      {feito ? (
                        <Check className="size-4 shrink-0" aria-hidden />
                      ) : atual ? (
                        <LoaderCircle className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden />
                      ) : (
                        <span className="size-4 shrink-0 rounded-full border-2 border-line" aria-hidden />
                      )}
                      {p}
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : clonar.vozGerada ? (
            <div className="overflow-hidden rounded-card border border-ia-border bg-panel">
              <div className="flex flex-wrap items-center gap-3 border-b border-ia-border/70 bg-ia-bg/60 px-4 py-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-sinal text-white">
                  <Mic className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ia-fg">Voz clonada (simulação)</p>
                  <p className="truncate text-[13px] text-ink-2">Criada a partir de {amostra.nome}</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-hum-bg px-2 py-1 text-xs font-semibold text-hum-fg">
                  <Check className="size-3.5" aria-hidden />
                  Pronta
                </span>
              </div>
              <div className="px-4 py-4">
                <OndaEstatica semente={semente} barras={96} className="h-12 overflow-hidden" />
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 cursor-pointer"
                    onClick={() => setPrevia(true)}
                  >
                    <Volume2 />
                    Ouvir prévia
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 cursor-pointer text-ink-2"
                    onClick={() => setClonar({ vozGerada: false })}
                  >
                    <RotateCcw />
                    Gerar de novo
                  </Button>
                </div>
                <p className="mt-2 text-xs text-ink-3">A voz clonada é gerada na implantação.</p>
              </div>
            </div>
          ) : (
            <div>
              <Button id="agente-gerar-voz" type="button" className="h-10 cursor-pointer px-4" onClick={gerar}>
                <Sparkles />
                Gerar voz clonada
              </Button>
              <ErroCampo id="agente-gerar-voz-erro">{erro('vozGerada')}</ErroCampo>
            </div>
          )}
        </div>
      )}
      <EmDesenvolvimentoDialog
        aberto={previa}
        onAbertoChange={setPrevia}
        recurso="Prévia da voz clonada"
        detalhe="Na implantação, você ouve o agente falando com a voz clonada antes de ativá-lo."
      />
    </div>
  );
}
