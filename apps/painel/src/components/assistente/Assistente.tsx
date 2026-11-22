'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Info, PanelLeft, SquarePen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmDesenvolvimentoDialog } from '@/components/ui/em-desenvolvimento';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Composer } from './Composer';
import { ContextoAssistente } from './contexto';
import { EstadoVazio } from './EstadoVazio';
import { Historico } from './Historico';
import { MensagemAssistente, MensagemUsuario, Pensando } from './Mensagem';
import {
  CONVERSAS_INICIAIS,
  escolherResposta,
  tituloDaMensagem,
  totalPalavras,
  type Conversa,
  type MensagemChat,
  type Resposta,
} from './respostas';

/** Quanto tempo o assistente "pensa" antes de começar a escrever. */
const PENSANDO_MS = 1200;

// Pontos do estado "pensando". Fica aqui para não mexer no CSS global por causa de uma tela.
const CSS_ASSISTENTE = `
@keyframes assistente-ponto {
  0%, 80%, 100% { opacity: .35; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-3px); }
}
.assistente-ponto { animation: assistente-ponto 1.2s var(--ease-standard) infinite; }
@media (prefers-reduced-motion: reduce) { .assistente-ponto { animation: none; opacity: .7; } }
`;

type Geracao = {
  conversaId: string;
  mensagemId: string;
  resposta: Resposta;
  status: string;
  fase: 'pensando' | 'escrevendo';
  /** palavras já escritas na fase "escrevendo" */
  visiveis: number;
};

let sequencia = 0;
const novoId = () => `a${Date.now().toString(36)}${(sequencia++).toString(36)}`;

function anexar(conversas: Conversa[], conversaId: string, mensagem: MensagemChat): Conversa[] {
  return conversas.map((c) =>
    c.id === conversaId ? { ...c, mensagens: [...c.mensagens, mensagem] } : c,
  );
}

const CONSULTA_MOVIMENTO = '(prefers-reduced-motion: reduce)';
function assinarMovimento(aviso: () => void) {
  const mq = window.matchMedia(CONSULTA_MOVIMENTO);
  mq.addEventListener('change', aviso);
  return () => mq.removeEventListener('change', aviso);
}
function useMovimentoReduzido(): boolean {
  return useSyncExternalStore(
    assinarMovimento,
    () => window.matchMedia(CONSULTA_MOVIMENTO).matches,
    () => false,
  );
}

export function Assistente({ primeiroNome, saudacao }: { primeiroNome: string; saudacao: string }) {
  const [conversas, setConversas] = useState<Conversa[]>(CONVERSAS_INICIAIS);
  const [ativaId, setAtivaId] = useState<string | null>(null);
  const [geracao, setGeracao] = useState<Geracao | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [emDev, setEmDev] = useState<{ aberto: boolean; recurso: string; detalhe?: string }>({
    aberto: false,
    recurso: '',
  });
  const reduzido = useMovimentoReduzido();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rolagemRef = useRef<HTMLDivElement>(null);
  /** a rolagem acompanha o fim da conversa enquanto a pessoa não subir para ler */
  const coladoNoFimRef = useRef(true);
  const irParaTopoRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const ocupado = geracao !== null;
  const ativa = ativaId ? (conversas.find((c) => c.id === ativaId) ?? null) : null;

  const limparTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Pensando por ~1,2 s, depois escreve palavra por palavra (25 a 40 ms cada).
  // Com movimento reduzido, a resposta aparece inteira de uma vez.
  useEffect(() => {
    if (!geracao) return;
    if (geracao.fase === 'pensando') {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const { conversaId, mensagemId, resposta } = geracao;
        setConversas((cs) =>
          anexar(cs, conversaId, { id: mensagemId, autor: 'assistente', resposta }),
        );
        if (reduzido) {
          setGeracao(null);
          setAnuncio('Resposta do assistente pronta.');
        } else {
          setGeracao({ ...geracao, fase: 'escrevendo', visiveis: 0 });
          setAnuncio('O assistente está respondendo.');
        }
      }, PENSANDO_MS);
      return limparTimer;
    }
    const total = totalPalavras(geracao.resposta);
    timerRef.current = window.setTimeout(
      () => {
        timerRef.current = null;
        const proximo = geracao.visiveis + 1;
        if (proximo >= total) {
          setGeracao(null);
          setAnuncio('Resposta do assistente pronta.');
        } else {
          setGeracao({ ...geracao, visiveis: proximo });
        }
      },
      25 + Math.random() * 15,
    );
    return limparTimer;
  }, [geracao, reduzido, limparTimer]);

  useEffect(() => limparTimer, [limparTimer]);

  // Rolagem: topo ao abrir uma conversa do histórico; fim enquanto chegam mensagens novas.
  useLayoutEffect(() => {
    const el = rolagemRef.current;
    if (!el) return;
    if (irParaTopoRef.current) {
      irParaTopoRef.current = false;
      el.scrollTop = 0;
      return;
    }
    if (coladoNoFimRef.current) el.scrollTop = el.scrollHeight;
  });

  // Foco no campo só com mouse: no toque, abriria o teclado sem a pessoa pedir.
  const focarCampo = useCallback(() => {
    if (window.matchMedia('(pointer: fine)').matches)
      textareaRef.current?.focus({ preventScroll: true });
  }, []);
  const focarAoFecharHistoricoRef = useRef(false);

  useEffect(() => focarCampo(), [focarCampo]);

  const emDesenvolvimento = useCallback((recurso: string, detalhe?: string) => {
    setEmDev({ aberto: true, recurso, detalhe });
  }, []);

  const enviar = useCallback(
    (bruto: string) => {
      const texto = bruto.trim();
      if (!texto || ocupado) return;
      const { resposta, status } = escolherResposta(texto);
      const mensagem: MensagemChat = { id: novoId(), autor: 'usuario', texto };
      let conversaId = ativaId;
      if (conversaId === null) {
        const nova: Conversa = {
          id: novoId(),
          titulo: tituloDaMensagem(texto),
          grupo: 'hoje',
          mensagens: [mensagem],
        };
        conversaId = nova.id;
        setConversas((cs) => [nova, ...cs]);
        setAtivaId(nova.id);
      } else {
        const id = conversaId;
        setConversas((cs) => anexar(cs, id, mensagem));
      }
      coladoNoFimRef.current = true;
      setAnuncio(status);
      setGeracao({
        conversaId,
        mensagemId: novoId(),
        resposta,
        status,
        fase: 'pensando',
        visiveis: 0,
      });
      // Quem clicou num atalho ou numa sugestão continua no campo de mensagem.
      focarCampo();
    },
    [ativaId, ocupado, focarCampo],
  );

  /** Ao trocar de conversa no meio de uma resposta, ela termina de imediato na conversa de origem. */
  function concluirGeracao() {
    limparTimer();
    if (!geracao) return;
    if (geracao.fase === 'pensando') {
      const { conversaId, mensagemId, resposta } = geracao;
      setConversas((cs) =>
        anexar(cs, conversaId, { id: mensagemId, autor: 'assistente', resposta }),
      );
    }
    setGeracao(null);
  }

  function parar() {
    limparTimer();
    if (!geracao) return;
    const { conversaId, mensagemId, resposta, fase, visiveis } = geracao;
    if (fase === 'pensando') {
      setConversas((cs) =>
        anexar(cs, conversaId, {
          id: mensagemId,
          autor: 'assistente',
          resposta,
          interrompidaEm: 0,
        }),
      );
    } else {
      setConversas((cs) =>
        cs.map((c) =>
          c.id !== conversaId
            ? c
            : {
                ...c,
                mensagens: c.mensagens.map((m) =>
                  m.id === mensagemId && m.autor === 'assistente'
                    ? { ...m, interrompidaEm: visiveis }
                    : m,
                ),
              },
        ),
      );
    }
    setGeracao(null);
    setAnuncio('Resposta interrompida.');
    focarCampo();
  }

  function novaConversa() {
    concluirGeracao();
    setAtivaId(null);
    coladoNoFimRef.current = true;
    if (historicoAberto) {
      focarAoFecharHistoricoRef.current = true;
      setHistoricoAberto(false);
    } else {
      window.requestAnimationFrame(focarCampo);
    }
  }

  function abrirConversa(id: string) {
    concluirGeracao();
    if (id !== ativaId) irParaTopoRef.current = true;
    coladoNoFimRef.current = false;
    setAtivaId(id);
    if (historicoAberto) {
      focarAoFecharHistoricoRef.current = true;
      setHistoricoAberto(false);
    }
  }

  function aoRolar() {
    const el = rolagemRef.current;
    if (!el) return;
    coladoNoFimRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
  }

  const acoes = useMemo(
    () => ({ enviar, emDesenvolvimento, ocupado }),
    [enviar, emDesenvolvimento, ocupado],
  );

  const historico = (
    <Historico
      conversas={conversas}
      ativaId={ativaId}
      onNova={novaConversa}
      onAbrir={abrirConversa}
    />
  );

  return (
    <ContextoAssistente.Provider value={acoes}>
      <style>{CSS_ASSISTENTE}</style>
      <div className="flex h-full min-h-[460px] overflow-hidden bg-panel">
        <aside
          aria-label="Conversas com o assistente"
          className="hidden w-[260px] shrink-0 border-r border-line bg-canvas min-[1100px]:block"
        >
          {historico}
        </aside>

        <section aria-label="Conversa com o assistente" className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line-subtle px-3 sm:px-4">
            <Button
              variant="ghost"
              size="icon-lg"
              className="text-ink-2 min-[1100px]:hidden"
              aria-label="Abrir histórico de conversas"
              onClick={() => setHistoricoAberto(true)}
            >
              <PanelLeft strokeWidth={1.75} aria-hidden="true" />
            </Button>
            <h2 className="min-w-0 truncate font-sans text-sm leading-5 font-bold text-ink">
              {ativa?.titulo ?? 'Nova conversa'}
            </h2>
            <SeloPrevia />
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon-lg"
              className="text-ink-2 min-[1100px]:hidden"
              aria-label="Nova conversa"
              onClick={novaConversa}
            >
              <SquarePen strokeWidth={1.75} aria-hidden="true" />
            </Button>
          </header>

          <div
            ref={rolagemRef}
            onScroll={aoRolar}
            className="funil-rolagem min-h-0 flex-1 overflow-y-auto"
          >
            {ativa ? (
              <div className="mx-auto w-full max-w-[760px] space-y-8 px-4 pt-6 pb-10 sm:px-6">
                {ativa.mensagens.map((m) => {
                  if (m.autor === 'usuario') return <MensagemUsuario key={m.id} texto={m.texto} />;
                  const escrevendo = geracao?.fase === 'escrevendo' && geracao.mensagemId === m.id;
                  return (
                    <MensagemAssistente
                      key={m.id}
                      mensagem={m}
                      visiveis={escrevendo ? geracao.visiveis : null}
                      escrevendo={escrevendo}
                    />
                  );
                })}
                {geracao?.fase === 'pensando' && geracao.conversaId === ativa.id ? (
                  <Pensando status={geracao.status} />
                ) : null}
              </div>
            ) : (
              <EstadoVazio saudacao={saudacao} primeiroNome={primeiroNome} />
            )}
          </div>

          <div className="shrink-0 px-4 pt-2 pb-3 sm:px-6">
            <div className="mx-auto max-w-[760px]">
              <Composer
                textareaRef={textareaRef}
                ocupado={ocupado}
                onEnviar={enviar}
                onParar={parar}
                onAnexar={() =>
                  emDesenvolvimento(
                    'Anexar arquivos',
                    'Na próxima fase, você poderá anexar planilhas e documentos para o assistente analisar junto com os dados da operação.',
                  )
                }
              />
            </div>
          </div>
        </section>
      </div>

      <Sheet open={historicoAberto} onOpenChange={setHistoricoAberto}>
        <SheetContent
          side="left"
          className="w-[300px] gap-0 bg-canvas p-0"
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            // Depois de escolher uma conversa, o foco vai para o campo, não de volta ao botão.
            if (!focarAoFecharHistoricoRef.current) return;
            focarAoFecharHistoricoRef.current = false;
            e.preventDefault();
            focarCampo();
          }}
        >
          <SheetHeader className="border-b border-line px-4 py-3.5">
            <SheetTitle className="font-display text-[17px] leading-6 font-semibold tracking-[-0.01em]">
              Conversas
            </SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col">{historico}</div>
        </SheetContent>
      </Sheet>

      <EmDesenvolvimentoDialog
        aberto={emDev.aberto}
        onAbertoChange={(aberto) => setEmDev((e) => ({ ...e, aberto }))}
        recurso={emDev.recurso}
        detalhe={emDev.detalhe}
      />

      <div className="sr-only" aria-live="polite" role="status">
        {anuncio}
      </div>
    </ContextoAssistente.Provider>
  );
}

function SeloPrevia() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-ia-border bg-ia-bg px-2 text-xs font-semibold text-ia-fg transition-colors duration-[120ms] outline-none hover:bg-ia-border/40 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Info className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          Prévia
          <span className="sr-only">. Ver o que isso significa</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 text-sm leading-5">
        <p className="font-bold text-ink">Prévia do assistente</p>
        <p className="text-ink-2">
          Respostas de demonstração. O assistente conectado aos dados chega na próxima fase.
        </p>
      </PopoverContent>
    </Popover>
  );
}
