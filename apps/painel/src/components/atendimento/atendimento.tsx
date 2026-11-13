'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ehNumeroFicticio,
  ROTULOS_ETAPA,
  type ConversaDetalheDTO,
  type ConversaItemDTO,
  type EstadoConversa,
  type FiltroConversas,
  type ListaConversasDTO,
  type ListaMensagensDTO,
  type MensagemDTO,
  type TrilhaItemDTO,
} from '@sales-hub/shared';
import {
  ArrowLeft,
  ArrowRightLeft,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileText,
  FlaskConical,
  Info,
  Keyboard,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Package,
  Pause,
  Phone,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  ShieldCheck,
  Siren,
  Smile,
  UserRound,
  UserRoundSearch,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { bff } from '@/lib/bff';
import { chaves } from '@/lib/queries';
import { rotuloProduto } from '@/lib/formatos';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmDesenvolvimento } from '@/components/ui/em-desenvolvimento';

const estados = {
  IA_ATIVA: {
    titulo: 'IA atendendo',
    curto: 'IA',
    Icon: Bot,
    classe: 'bg-ia-bg text-ia-fg border-ia-border',
    solido: 'bg-ia-solid',
    anel: 'ring-ia-solid',
  },
  HUMANO: {
    titulo: 'Humano atendendo',
    curto: 'Humano',
    Icon: UserRound,
    classe: 'bg-hum-bg text-hum-fg border-hum-border',
    solido: 'bg-hum-solid',
    anel: 'ring-hum-solid',
  },
  IA_PAUSADA: {
    titulo: 'IA pausada',
    curto: 'Pausada',
    Icon: Pause,
    classe: 'bg-pau-bg text-pau-fg border-pau-border',
    solido: 'bg-pau-solid',
    anel: 'ring-pau-solid',
  },
  AGUARDANDO_ESPECIALISTA: {
    titulo: 'Aguardando especialista',
    curto: 'Especialista',
    Icon: UserRoundSearch,
    classe: 'bg-esp-bg text-esp-fg border-esp-border',
    solido: 'bg-esp-solid',
    anel: 'ring-esp-solid',
  },
  ENCERRADA: {
    titulo: 'Encerrada',
    curto: 'Encerrada',
    Icon: CircleCheck,
    classe: 'bg-chat text-ink-2 border-line',
    solido: 'bg-ink-3',
    anel: 'ring-ink-3',
  },
} as const;
const filtros: { valor: FiltroConversas; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'nao_lidas', rotulo: 'Não lidas' },
  { valor: 'aguardando_humano', rotulo: 'Aguardando humano' },
  { valor: 'ia', rotulo: 'IA atendendo' },
  { valor: 'minhas', rotulo: 'Minhas' },
  { valor: 'intencao', rotulo: 'Intenção de contratar' },
  { valor: 'prioridade', rotulo: 'Prioridade' },
  { valor: 'encerradas', rotulo: 'Encerradas' },
];
const hora = (data: string) =>
  new Date(data).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
const nome = (c: ConversaItemDTO) => c.contato.nome || c.contato.telefoneExibicao;
const mensagemErro = (erro: unknown) =>
  erro instanceof Error ? erro.message : 'Não foi possível concluir. Tente de novo.';
// O servidor identifica contatos fictícios. Não inferimos demonstração de um telefone real.
const demonstracao = (c: ConversaItemDTO) =>
  Boolean(
    ehNumeroFicticio(c.contato.e164) ||
    (c as ConversaItemDTO & { ficticio?: boolean }).ficticio ||
    (c as ConversaItemDTO & { temDadosDemo?: boolean }).temDadosDemo,
  );

function BadgeEstado({ estado }: { estado: EstadoConversa }) {
  const e = estados[estado];
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold',
        e.classe,
      )}
    >
      <e.Icon className="size-3 shrink-0" />
      <span className="truncate">{e.titulo}</span>
    </span>
  );
}
function AvatarContato({
  conversa,
  pequeno = false,
}: {
  conversa: ConversaItemDTO;
  pequeno?: boolean;
}) {
  const iniciais = (conversa.contato.nome || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('');
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-sunken font-semibold text-[#374151] ring-2 ring-offset-2 ring-offset-panel',
        pequeno ? 'size-9 text-xs' : 'size-10 text-sm',
        estados[conversa.estado].anel,
      )}
    >
      {iniciais || <Phone className="size-4" />}
    </span>
  );
}
function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-esp-bg px-2 py-1 text-xs font-semibold text-esp-fg">
      <FlaskConical className="size-3" />
      Demonstração
    </span>
  );
}
export function AtendimentoSkeleton() {
  return (
    <div className="grid h-full min-h-[480px] grid-cols-[280px_1fr] bg-panel p-4">
      <div className="space-y-5 border-r pr-4">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <div className="flex flex-col gap-6 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="mt-auto h-24 w-full" />
      </div>
    </div>
  );
}

export function Atendimento() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const selecionada = params.get('c') || '';
  const [filtro, setFiltro] = useState<FiltroConversas>('todas');
  const [busca, setBusca] = useState('');
  const [buscaConsultada, setBuscaConsultada] = useState('');
  const [detalhes, setDetalhes] = useState(false);
  const [atalhos, setAtalhos] = useState(false);
  const [nova, setNova] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novoTelefone, setNovoTelefone] = useState('');
  const novaConversa = useMutation({
    mutationFn: () =>
      bff.post<{ conversationId: string }>('conversas', {
        nome: novoNome.trim() || undefined,
        e164: novoTelefone.trim(),
      }),
    onSuccess: (r) => {
      setNova(false);
      setNovoNome('');
      setNovoTelefone('');
      setFiltro('todas');
      setBusca('');
      void qc.invalidateQueries({ queryKey: ['conversas'] });
      router.replace(`/atendimento?c=${encodeURIComponent(r.conversationId)}`, { scroll: false });
      toast.success('Conversa aberta. Escreva a primeira mensagem quando estiver pronto.');
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const lista = useInfiniteQuery({
    queryKey: ['conversas', 'atendimento', filtro, buscaConsultada] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      bff.get<ListaConversasDTO>(
        `conversas?filtro=${filtro}&busca=${encodeURIComponent(buscaConsultada)}&limite=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    getNextPageParam: (ultimaPagina) => ultimaPagina.proximoCursor ?? undefined,
    select: (data) => ({
      itens: data.pages.flatMap((pagina) => pagina.itens),
      proximoCursor: data.pages.at(-1)?.proximoCursor ?? null,
    }),
  });
  const detalhe = useQuery({
    queryKey: chaves.conversa(selecionada),
    queryFn: () => bff.get<ConversaDetalheDTO>(`conversas/${selecionada}`),
    enabled: !!selecionada,
  });
  const mensagens = useQuery({
    queryKey: chaves.mensagens(selecionada),
    queryFn: () => bff.get<ListaMensagensDTO>(`conversas/${selecionada}/mensagens`),
    enabled: !!selecionada,
  });
  const trilha = useQuery({
    queryKey: chaves.trilha(selecionada),
    queryFn: () => bff.get<TrilhaItemDTO[]>(`conversas/${selecionada}/trilha`),
    enabled: !!selecionada,
  });
  const digitando = useQuery({
    queryKey: chaves.digitando(selecionada),
    queryFn: () => false,
    enabled: false,
  });

  useEffect(() => {
    const t = setTimeout(() => setBuscaConsultada(busca), 250);
    return () => clearTimeout(t);
  }, [busca]);
  function abrir(id: string) {
    router.replace(`/atendimento?c=${encodeURIComponent(id)}`, { scroll: false });
  }
  useEffect(() => {
    if (!selecionada && lista.data?.itens[0] && window.innerWidth >= 1024)
      router.replace(`/atendimento?c=${encodeURIComponent(lista.data.itens[0].id)}`, {
        scroll: false,
      });
  }, [selecionada, lista.data, router]);
  useEffect(() => {
    if (!selecionada) return;
    void bff
      .post(`conversas/${selecionada}/ler`)
      .then(() => {
        void qc.invalidateQueries({ queryKey: chaves.naoLidas() });
      })
      .catch(() => {});
  }, [selecionada, qc]);
  useEffect(() => {
    function teclado(e: KeyboardEvent) {
      if (
        (e.target as HTMLElement)?.matches('input,textarea,select,[contenteditable=true]') ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      if (e.key === '?') {
        e.preventDefault();
        setAtalhos(true);
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const itens = lista.data?.itens || [];
        const i = itens.findIndex((c) => c.id === selecionada);
        const proxima =
          itens[Math.min(itens.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        if (proxima) {
          e.preventDefault();
          abrir(proxima.id);
        }
      }
    }
    document.addEventListener('keydown', teclado);
    return () => document.removeEventListener('keydown', teclado);
  });
  function atualizar() {
    void qc.invalidateQueries({ queryKey: ['conversas'] });
    void qc.invalidateQueries({ queryKey: chaves.conversa(selecionada) });
    void qc.invalidateQueries({ queryKey: chaves.mensagens(selecionada) });
    void qc.invalidateQueries({ queryKey: chaves.trilha(selecionada) });
  }
  function verMensagem(id: string) {
    setDetalhes(false);
    setTimeout(() => {
      const el = document.getElementById(`mensagem-${id}`);
      if (!el) {
        toast.info('A mensagem de origem não está no histórico carregado.');
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-pau-solid');
      setTimeout(() => el.classList.remove('ring-2', 'ring-pau-solid'), 1500);
    }, 150);
  }
  const contexto = detalhe.data ? (
    <Contexto
      detalhe={detalhe.data}
      trilha={trilha.data || []}
      carregandoTrilha={trilha.isPending}
      erroTrilha={trilha.isError}
      atualizar={atualizar}
      verMensagem={verMensagem}
    />
  ) : null;

  return (
    <div className="flex h-full min-h-[460px] overflow-hidden bg-panel">
      <aside
        aria-label="Lista de conversas"
        className={cn(
          'w-full shrink-0 flex-col border-r border-line lg:flex lg:w-[280px] min-[1440px]:w-[300px]',
          selecionada ? 'hidden' : 'flex',
        )}
      >
        <div className="border-b border-line-subtle px-4 pb-4 pt-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[17px] font-semibold">Conversas</h2>
              <span className="rounded-md bg-chat px-2 py-0.5 text-xs font-semibold text-ink-2 tabular-nums">
                {lista.data?.itens.length ?? '—'}
              </span>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setAtalhos(true)}
                aria-label="Atalhos de teclado"
              >
                <Keyboard />
              </Button>
              <Button
                size="icon-sm"
                onClick={() => setNova(true)}
                aria-label="Novo atendimento"
                title="Novo atendimento"
              >
                <Plus />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
            <Input
              aria-label="Buscar conversas"
              placeholder="Buscar nome, telefone ou mensagem"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-9 bg-panel pl-9 text-[13px]"
            />
          </div>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" aria-label="Filtros">
            {filtros.map((f) => (
              <button
                key={f.valor}
                onClick={() => setFiltro(f.valor)}
                aria-pressed={filtro === f.valor}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sinal',
                  filtro === f.valor
                    ? 'border-noite bg-noite text-white'
                    : 'border-line bg-panel text-ink-2 hover:bg-chat',
                )}
              >
                {f.rotulo}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {lista.isPending ? (
            Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="flex gap-3 border-b border-line-subtle p-4">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            ))
          ) : lista.isError && !lista.data ? (
            <EstadoVazio
              erro
              titulo="As conversas não carregaram"
              texto={mensagemErro(lista.error)}
              acao={() => void lista.refetch()}
            />
          ) : !lista.data?.itens.length ? (
            <EstadoVazio
              titulo="Tudo em dia por aqui"
              texto={
                busca
                  ? 'Nenhuma conversa corresponde à busca. Tente outro nome ou telefone.'
                  : 'Nenhuma conversa neste filtro. As novas mensagens aparecerão aqui.'
              }
            />
          ) : (
            lista.data.itens.map((c) => (
              <button
                key={c.id}
                onClick={() => abrir(c.id)}
                aria-current={selecionada === c.id ? 'true' : undefined}
                className={cn(
                  'relative flex min-h-[104px] w-full gap-3 border-b border-line-subtle px-4 py-3 text-left transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-sinal',
                  c.prioridade === 'emergencia'
                    ? 'bg-emg-bg'
                    : selecionada === c.id
                      ? 'bg-ia-bg'
                      : 'hover:bg-chat',
                  selecionada === c.id &&
                    'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-sinal',
                )}
              >
                <div className="pt-1">
                  <AvatarContato conversa={c} pequeno />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold">{nome(c)}</span>
                    <time className="shrink-0 text-xs text-ink-3 tabular-nums">
                      {c.ultimaMensagemEm ? hora(c.ultimaMensagemEm) : ''}
                    </time>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-2">
                    {c.ultimaMensagem?.autor === 'ia' && (
                      <Bot className="size-3 shrink-0 text-ia-fg" />
                    )}
                    {c.ultimaMensagem?.autor === 'atendente' && (
                      <CheckCheck className="size-3 shrink-0" />
                    )}
                    <span className="truncate">
                      {c.ultimaMensagem?.texto || 'Conversa iniciada'}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-1">
                    <BadgeEstado estado={c.estado} />
                    {c.prioridade === 'emergencia' && <Siren className="size-4 text-emg-fg" />}
                    {c.naoLidas > 0 && (
                      <span className="flex min-w-5 items-center justify-center rounded-full bg-sinal px-1 text-xs font-bold text-white">
                        {c.naoLidas}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
          {lista.isFetchNextPageError && (
            <p role="alert" className="px-4 pt-3 text-xs text-emg-fg">
              As próximas conversas não carregaram. Tente de novo.
            </p>
          )}
          {lista.hasNextPage && (
            <div className="p-3">
              <Button
                variant="outline"
                className="h-9 w-full"
                disabled={lista.isFetchingNextPage}
                onClick={() => void lista.fetchNextPage()}
              >
                {lista.isFetchingNextPage ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <ChevronDown />
                )}
                {lista.isFetchingNextPage
                  ? 'Carregando…'
                  : lista.isFetchNextPageError
                    ? 'Tentar carregar novamente'
                    : 'Carregar mais'}
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 border-t px-4 py-3 text-xs text-ink-3">
          <ShieldCheck className="size-3.5" />
          Seu time e a IA, na mesma conversa
        </div>
      </aside>

      <section
        aria-label="Conversa selecionada"
        className={cn('min-w-0 flex-1 flex-col', selecionada ? 'flex' : 'hidden lg:flex')}
      >
        {!selecionada ? (
          <div className="flex flex-1 items-center justify-center bg-canvas">
            <EstadoVazio
              titulo="Uma boa conversa começa aqui"
              texto="Selecione um contato para acompanhar a IA ou assumir o atendimento."
            />
          </div>
        ) : detalhe.isPending ? (
          <div className="flex h-full flex-col gap-5 p-5">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="mt-auto h-28 w-full" />
          </div>
        ) : detalhe.isError || !detalhe.data ? (
          <EstadoVazio
            erro
            titulo="Não foi possível abrir a conversa"
            texto={mensagemErro(detalhe.error)}
            acao={() => void detalhe.refetch()}
          />
        ) : (
          <>
            <header className="flex min-h-[76px] items-center gap-3 border-b px-4 py-3">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => router.replace('/atendimento')}
                aria-label="Voltar às conversas"
              >
                <ArrowLeft />
              </Button>
              <AvatarContato conversa={detalhe.data.conversa} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-sm font-bold">{nome(detalhe.data.conversa)}</h2>
                  {demonstracao(detalhe.data.conversa) && <DemoBadge />}
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                  <MessageCircle className="size-3.5" />
                  WhatsApp
                  <span className="ml-1 tabular-nums">{detalhe.data.contato.telefoneExibicao}</span>
                </p>
              </div>
              <Button
                variant="outline"
                className="min-[1200px]:hidden"
                onClick={() => setDetalhes(true)}
              >
                <Info />
                Detalhes
              </Button>
            </header>
            <ControlStrip detalhe={detalhe.data} atualizar={atualizar} />
            <Thread
              mensagens={mensagens.data?.itens || []}
              carregando={mensagens.isPending}
              erro={mensagens.isError ? mensagemErro(mensagens.error) : undefined}
              tentar={() => void mensagens.refetch()}
              digitando={!!digitando.data}
              conversationId={selecionada}
              atualizar={atualizar}
            />
            <Composer key={selecionada} detalhe={detalhe.data} atualizar={atualizar} />
          </>
        )}
      </section>
      <aside
        aria-label="Contexto da conversa"
        className="hidden w-[280px] shrink-0 overflow-y-auto border-l min-[1200px]:block min-[1440px]:w-[320px] min-[1680px]:w-[360px]"
      >
        {contexto || (
          <div className="space-y-4 p-5">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-60 w-full" />
          </div>
        )}
      </aside>
      <Sheet open={detalhes} onOpenChange={setDetalhes}>
        <SheetContent className="w-[min(400px,100vw)] gap-0 overflow-y-auto p-0 sm:max-w-[400px]">
          <SheetHeader className="border-b">
            <SheetTitle>Contexto da conversa</SheetTitle>
            <SheetDescription>Informações do contato e decisões da IA.</SheetDescription>
          </SheetHeader>
          {contexto}
        </SheetContent>
      </Sheet>
      <Dialog open={nova} onOpenChange={setNova}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (/^\+[1-9]\d{7,14}$/.test(novoTelefone.trim())) novaConversa.mutate();
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>Novo atendimento</DialogTitle>
              <DialogDescription>
                Abra uma conversa com um contato. Você revisa a mensagem antes de enviar.
              </DialogDescription>
            </DialogHeader>
            <label className="block space-y-1.5 text-sm font-medium">
              Nome (opcional)
              <Input
                placeholder="Nome do contato"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              WhatsApp
              <Input
                type="tel"
                placeholder="+5511900000099"
                value={novoTelefone}
                onChange={(e) => setNovoTelefone(e.target.value)}
                autoComplete="tel"
                required
                pattern="\+[1-9][0-9]{7,14}"
              />
              <span className="block text-xs font-normal text-ink-3">
                Use +, código do país, DDD e número.
              </span>
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNova(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!/^\+[1-9]\d{7,14}$/.test(novoTelefone.trim()) || novaConversa.isPending}
              >
                {novaConversa.isPending ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <MessageCircle />
                )}
                Abrir conversa
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={atalhos} onOpenChange={setAtalhos}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atalhos de teclado</DialogTitle>
            <DialogDescription>Mais agilidade no atendimento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {[
              ['↑ / ↓', 'Navegar entre conversas'],
              ['Enter', 'Enviar mensagem'],
              ['Shift + Enter', 'Quebrar linha'],
              ['/', 'Abrir respostas rápidas'],
              ['?', 'Mostrar atalhos'],
            ].map(([tecla, texto]) => (
              <div key={tecla} className="flex items-center justify-between gap-3">
                <span className="text-ink-2">{texto}</span>
                <kbd className="rounded border bg-chat px-2 py-1 font-sans text-xs">{tecla}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EstadoVazio({
  titulo,
  texto,
  erro,
  acao,
}: {
  titulo: string;
  texto: string;
  erro?: boolean;
  acao?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
      <span
        className={cn(
          'flex size-12 items-center justify-center rounded-2xl',
          erro ? 'bg-emg-bg text-emg-fg' : 'bg-chat text-ink-3',
        )}
      >
        {erro ? <CircleAlert className="size-6" /> : <MessageCircle className="size-6" />}
      </span>
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <p className="max-w-sm text-[13px] leading-5 text-ink-2">{texto}</p>
      {acao && (
        <Button variant="outline" onClick={acao}>
          <RefreshCw />
          Tentar de novo
        </Button>
      )}
    </div>
  );
}

function ControlStrip({
  detalhe,
  atualizar,
}: {
  detalhe: ConversaDetalheDTO;
  atualizar: () => void;
}) {
  const [transferir, setTransferir] = useState(false);
  const [encerrar, setEncerrar] = useState(false);
  const [destino, setDestino] = useState('');
  const [nota, setNota] = useState('');
  const [destinoTipo, setDestinoTipo] = useState<'setor' | 'usuario'>('setor');
  const conversa = detalhe.conversa;
  const equipe = useQuery({
    queryKey: ['atendimento-equipe'],
    queryFn: () =>
      bff.get<{
        usuarios: { id: string; nome: string }[];
        setores: { id: string; nome: string }[];
      }>('equipe'),
    enabled: transferir,
    retry: false,
  });
  const controle = useMutation({
    mutationFn: ({ acao, body }: { acao: string; body?: unknown }) =>
      bff.post(`conversas/${conversa.id}/${acao}`, body),
    onSuccess: (_, variaveis) => {
      // Ações confirmadas em modal: o modal sai primeiro e só depois a tela muda.
      const viaModal = variaveis.acao === 'transferir' || variaveis.acao === 'encerrar';
      setTransferir(false);
      setEncerrar(false);
      if (viaModal) window.setTimeout(atualizar, 190);
      else atualizar();
      toast.success(
        (
          {
            assumir: 'Você assumiu o atendimento. A IA não envia mais mensagens nesta conversa.',
            pausar: 'IA pausada nesta conversa.',
            devolver: 'Conversa devolvida à IA.',
            encerrar: 'Atendimento encerrado.',
            transferir: 'Atendimento transferido.',
          } as Record<string, string>
        )[variaveis.acao],
      );
    },
    onError: (e) => toast.error(mensagemErro(e)),
  });
  const horas = conversa.janelaAteEm
    ? Math.max(0, Math.floor((new Date(conversa.janelaAteEm).getTime() - Date.now()) / 60000))
    : 0;
  return (
    <div className="border-b bg-panel px-4 py-3" aria-live="polite">
      <div className="mb-3 flex items-center gap-3">
        <span className="text-xs font-semibold text-ink-2">Condução</span>
        <div className="flex min-w-0 flex-1 gap-1 rounded-lg bg-canvas p-1">
          {(
            ['IA_ATIVA', 'HUMANO', 'IA_PAUSADA', 'AGUARDANDO_ESPECIALISTA'] as EstadoConversa[]
          ).map((s) => {
            const e = estados[s];
            return (
              <span
                key={s}
                title={e.titulo}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold transition-colors duration-200',
                  conversa.estado === s ? `${e.solido} text-white` : 'text-ink-3',
                )}
              >
                <e.Icon className="size-3.5" />
                <span className="hidden sm:inline">{e.curto}</span>
              </span>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="lg"
          disabled={controle.isPending}
          onClick={() =>
            controle.mutate({ acao: conversa.estado === 'HUMANO' ? 'devolver' : 'assumir' })
          }
        >
          {controle.isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : conversa.estado === 'HUMANO' ? (
            <Bot />
          ) : (
            <UserRound />
          )}
          {conversa.estado === 'HUMANO'
            ? 'Devolver à IA'
            : conversa.estado === 'ENCERRADA'
              ? 'Reabrir atendimento'
              : 'Assumir atendimento'}
        </Button>
        {conversa.estado === 'IA_ATIVA' && (
          <Button
            variant="outline"
            size="lg"
            disabled={controle.isPending}
            onClick={() => controle.mutate({ acao: 'pausar' })}
          >
            <Pause />
            Pausar IA
          </Button>
        )}
        {(conversa.estado === 'IA_PAUSADA' || conversa.estado === 'AGUARDANDO_ESPECIALISTA') && (
          <Button
            variant="outline"
            size="lg"
            disabled={controle.isPending}
            onClick={() => controle.mutate({ acao: 'devolver' })}
          >
            <Bot />
            Devolver à IA
          </Button>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon-lg" aria-label="Mais ações de atendimento">
              <MoreHorizontal />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-48">
            <Button
              variant="ghost"
              className="justify-start"
              disabled={conversa.estado === 'ENCERRADA'}
              onClick={() => setTransferir(true)}
            >
              <ArrowRightLeft />
              Transferir
            </Button>
            <Button
              variant="ghost"
              className="justify-start"
              disabled={conversa.estado === 'ENCERRADA'}
              onClick={() => setEncerrar(true)}
            >
              <CircleCheck />
              Encerrar atendimento
            </Button>
          </PopoverContent>
        </Popover>
        <span
          className={cn(
            'ml-auto flex items-center gap-1 text-xs',
            horas ? 'text-ink-3' : 'text-pau-fg',
          )}
        >
          <Clock3 className="size-3.5" />
          {horas
            ? `Janela: ${Math.floor(horas / 60)}h${String(horas % 60).padStart(2, '0')}`
            : 'Janela de 24h fechada'}
        </span>
      </div>
      <AlertDialog open={encerrar} onOpenChange={setEncerrar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar atendimento?</AlertDialogTitle>
            <AlertDialogDescription>
              A conversa será marcada como encerrada. O histórico e as notas ficam disponíveis para
              consulta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={controle.isPending}
              onClick={(e) => {
                e.preventDefault();
                controle.mutate({ acao: 'encerrar' });
              }}
            >
              Encerrar atendimento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={transferir} onOpenChange={setTransferir}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Transferir atendimento</DialogTitle>
            <DialogDescription>
              O próximo responsável recebe o contexto desta conversa.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-card border border-ia-border bg-ia-bg p-3 text-sm">
            <p className="mb-2 flex items-center gap-2 font-semibold text-ia-fg">
              <Bot className="size-4" />
              Resumo para transferência
            </p>
            <p>{detalhe.resumo?.querOQue || 'Ainda não há um resumo desta conversa.'}</p>
            {detalhe.resumo?.jaInformou.length ? (
              <p className="mt-2 text-ink-2">
                Já informou: {detalhe.resumo.jaInformou.join(', ')}.
              </p>
            ) : null}
            {detalhe.resumo?.objecao && <p className="mt-2">Objeção: {detalhe.resumo.objecao}</p>}
            {detalhe.resumo?.proximoPasso && (
              <p className="mt-2 font-medium">Próximo passo: {detalhe.resumo.proximoPasso}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 text-sm">
              <p id="transferir-destino">Destino</p>
              <Select
                value={destinoTipo}
                onValueChange={(v) => {
                  setDestinoTipo(v as 'setor' | 'usuario');
                  setDestino('');
                }}
              >
                <SelectTrigger aria-labelledby="transferir-destino" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="setor">Setor</SelectItem>
                  <SelectItem value="usuario">Pessoa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 text-sm">
              <p id="transferir-responsavel">Responsável</p>
              <Select value={destino} onValueChange={setDestino}>
                <SelectTrigger aria-labelledby="transferir-responsavel" className="w-full">
                  <SelectValue
                    placeholder={equipe.isLoading ? 'Carregando equipe…' : 'Selecione'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(destinoTipo === 'setor' ? equipe.data?.setores : equipe.data?.usuarios)?.map(
                    (d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.nome}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          {equipe.isError && (
            <p className="text-xs text-emg-fg">
              Não foi possível carregar a equipe. Feche e tente de novo.
            </p>
          )}
          <label className="space-y-1 text-sm">
            Nota para a equipe (opcional)
            <Textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="O que o próximo responsável precisa saber?"
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferir(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!destino || controle.isPending}
              onClick={() =>
                controle.mutate({
                  acao: 'transferir',
                  body: { [destinoTipo === 'setor' ? 'setorId' : 'usuarioId']: destino, nota },
                })
              }
            >
              Transferir atendimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Thread({
  mensagens,
  carregando,
  erro,
  tentar,
  digitando,
  conversationId,
  atualizar,
}: {
  mensagens: MensagemDTO[];
  carregando: boolean;
  erro?: string;
  tentar: () => void;
  digitando: boolean;
  conversationId: string;
  atualizar: () => void;
}) {
  const fim = useRef<HTMLDivElement>(null);
  const [reenviando, setReenviando] = useState<string | null>(null);
  const ultimaMensagem = mensagens.at(-1)?.id;
  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [ultimaMensagem, conversationId]);
  async function reenviar(id: string) {
    setReenviando(id);
    try {
      await bff.post(`mensagens/${id}/reenviar`);
      atualizar();
    } catch (e) {
      toast.error(mensagemErro(e));
    } finally {
      setReenviando(null);
    }
  }
  const chaveDia = (data: string | Date) =>
    new Date(data).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  function dia(data: string) {
    const d = new Date(data);
    const hoje = new Date();
    if (chaveDia(d) === chaveDia(hoje)) return 'Hoje';
    hoje.setDate(hoje.getDate() - 1);
    if (chaveDia(d) === chaveDia(hoje)) return 'Ontem';
    return d.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      timeZone: 'America/Sao_Paulo',
    });
  }
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto bg-chat px-4 py-5 sm:px-6"
      aria-label="Histórico de mensagens"
      aria-live="polite"
    >
      {carregando ? (
        <div className="space-y-5">
          <Skeleton className="h-20 w-3/4 bg-panel" />
          <Skeleton className="ml-auto h-28 w-3/4 bg-panel" />
          <Skeleton className="h-16 w-1/2 bg-panel" />
        </div>
      ) : erro ? (
        <EstadoVazio erro titulo="O histórico não carregou" texto={erro} acao={tentar} />
      ) : !mensagens.length ? (
        <EstadoVazio
          titulo="Este é o começo da conversa"
          texto="Escreva uma mensagem para iniciar o atendimento. As mensagens enviadas e recebidas aparecem aqui."
        />
      ) : (
        mensagens.map((m, i) => {
          const nota = m.tipo === 'nota_interna';
          const sistema = m.autor === 'sistema' || m.tipo === 'evento';
          const entrada = m.autor === 'cliente';
          const citada = mensagens.find((c) => c.id === m.citadaId);
          const novoDia = i === 0 || chaveDia(m.criadaEm) !== chaveDia(mensagens[i - 1].criadaEm);
          return (
            <div key={m.id}>
              {novoDia && (
                <div className="my-5 flex justify-center">
                  <span className="rounded-md border border-line bg-panel px-3 py-1 text-xs font-semibold text-ink-3">
                    {dia(m.criadaEm)}
                  </span>
                </div>
              )}
              {sistema ? (
                <div
                  id={`mensagem-${m.id}`}
                  className="mx-auto my-4 max-w-[90%] rounded-chip px-3 py-1.5 text-center text-xs text-ink-3"
                >
                  {m.texto}
                </div>
              ) : (
                <div
                  id={`mensagem-${m.id}`}
                  className={cn(
                    'group relative mb-3 w-fit max-w-[88%] rounded-xl border px-3.5 py-2.5 sm:max-w-[82%]',
                    nota
                      ? 'mx-auto w-full max-w-[560px] border-dashed border-nota-border bg-nota-bg text-nota-fg'
                      : entrada
                        ? 'rounded-tl-sm border-line bg-panel'
                        : m.autor === 'ia'
                          ? 'ml-auto rounded-tr-sm border-ia-border bg-ia-bg'
                          : 'ml-auto rounded-tr-sm border-hum-border bg-hum-bg',
                    m.status === 'falhou' && 'border-emg-solid',
                  )}
                >
                  {nota && (
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                      <LockKeyhole className="size-3.5" />
                      Nota interna (só a equipe vê)
                    </p>
                  )}
                  {citada && (
                    <div
                      className={cn(
                        'mb-2 rounded border-l-[3px] bg-white/50 p-2 text-xs text-ink-2',
                        citada.autor === 'ia'
                          ? 'border-ia-solid'
                          : citada.autor === 'atendente'
                            ? 'border-hum-solid'
                            : 'border-ink-3',
                      )}
                    >
                      <strong className="mb-1 block">
                        {citada.autor === 'cliente'
                          ? 'Cliente'
                          : citada.autor === 'ia'
                            ? 'IA'
                            : citada.autorUsuario?.nome || 'Equipe'}
                      </strong>
                      <p className="line-clamp-2">{citada.texto}</p>
                    </div>
                  )}
                  {m.tipo !== 'texto' && !nota && (
                    <div className="mb-2 flex items-center gap-2 text-xs text-ink-2">
                      <FileText className="size-4" />
                      {(
                        {
                          audio: 'Áudio recebido',
                          imagem: 'Imagem recebida',
                          documento: 'Documento recebido',
                          video: 'Vídeo recebido',
                          figurinha: 'Figurinha recebida',
                        } as Record<string, string>
                      )[m.tipo] || 'Arquivo'}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-[22px]">
                    {m.texto ||
                      (m.tipo === 'texto' ? 'Mensagem sem texto' : 'Mídia disponível no WhatsApp.')}
                  </p>
                  <div className="mt-1.5 flex items-center justify-end gap-1.5 text-xs text-ink-3">
                    {m.autor === 'ia' ? (
                      <span className="flex items-center gap-1 font-semibold text-ia-fg">
                        <Bot className="size-3" />
                        IA
                      </span>
                    ) : m.autor === 'atendente' ? (
                      <span className={cn('font-semibold', !nota && 'text-hum-fg')}>
                        {m.autorUsuario?.nome.split(' ')[0] || 'Equipe'}
                      </span>
                    ) : null}
                    <time className="tabular-nums">{hora(m.criadaEm)}</time>
                    {m.status && m.status !== 'falhou' && (
                      <span title={m.status}>
                        {m.status === 'lida' || m.status === 'entregue' ? (
                          <CheckCheck
                            className={cn('size-3.5', m.status === 'lida' && 'text-ia-fg')}
                          />
                        ) : m.status === 'pendente' || m.status === 'enviando' ? (
                          <Clock3 className="size-3" />
                        ) : (
                          <Check className="size-3.5" />
                        )}
                      </span>
                    )}
                  </div>
                  {m.status === 'falhou' && (
                    <div className="mt-2 border-t border-emg-border pt-2 text-xs text-emg-fg">
                      <p className="flex items-center gap-1">
                        <CircleAlert className="size-3.5" />
                        Não enviada. {m.motivoFalha}
                      </p>
                      <button
                        disabled={reenviando === m.id}
                        className="mt-1 font-bold underline underline-offset-2"
                        onClick={() => void reenviar(m.id)}
                      >
                        {reenviando === m.id ? 'Reenviando…' : 'Tentar de novo'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
      {digitando && (
        <div className="ml-auto flex w-fit items-center gap-2 rounded-xl border border-ia-border bg-ia-bg px-4 py-3 text-xs font-semibold text-ia-fg">
          <Bot className="size-4 pino-pulso" />
          IA escrevendo…
        </div>
      )}
      <div ref={fim} />
    </div>
  );
}

function Composer({ detalhe, atualizar }: { detalhe: ConversaDetalheDTO; atualizar: () => void }) {
  const [texto, setTexto] = useState('');
  const [nota, setNota] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [naoPerguntar, setNaoPerguntar] = useState(false);
  const [erro, setErro] = useState('');
  const campo = useRef<HTMLTextAreaElement>(null);
  const estado = detalhe.conversa.estado;
  const janelaFechada =
    !!detalhe.conversa.janelaAteEm &&
    new Date(detalhe.conversa.janelaAteEm).getTime() <= Date.now();
  const restrito = detalhe.consentimento?.status === 'revogado';
  const envio = useMutation({
    mutationFn: (confirmarRestrito: boolean) =>
      bff.post(
        `conversas/${detalhe.conversa.id}/${nota ? 'notas' : 'mensagens'}`,
        nota
          ? { texto: texto.trim() }
          : { texto: texto.trim(), assumir: estado !== 'HUMANO', confirmarRestrito },
      ),
    onSuccess: () => {
      setTexto('');
      setErro('');
      setConfirmar(false);
      atualizar();
      if (nota) toast.success('Nota interna salva.');
    },
    onError: (e) => {
      setConfirmar(false);
      setErro(mensagemErro(e));
      atualizar();
    },
  });
  function enviar() {
    if (!texto.trim() || envio.isPending) return;
    setErro('');
    if (
      !nota &&
      (restrito ||
        (estado === 'IA_ATIVA' &&
          sessionStorage.getItem('saleshub-nao-confirmar-assumir') !== '1'))
    ) {
      setConfirmar(true);
      return;
    }
    envio.mutate(false);
  }
  const rapidas = [
    {
      nome: 'Apresentação',
      texto: 'Olá! Sou da equipe comercial. Como posso ajudar você hoje?',
    },
    {
      nome: 'Entender a necessidade',
      texto: 'Para preparar sua cotação, pode me contar o que você precisa e para quantas pessoas?',
    },
    {
      nome: 'Retorno da proposta',
      texto: 'Olá! Conseguiu analisar a proposta? Estou por aqui para esclarecer qualquer dúvida.',
    },
  ];
  return (
    <div className={cn('border-t px-4 py-3', nota ? 'bg-nota-bg' : 'bg-panel')}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Inserir emoji">
                <Smile />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-60">
              <p className="mb-1 text-xs font-semibold text-ink-2">Adicionar emoji</p>
              <div className="grid grid-cols-6 gap-1">
                {['😊', '👍', '👋', '🚗', '🛡️', '✅', '🤝', '📍', '🙏', '💬', '☀️', '💙'].map(
                  (e) => (
                    <button
                      key={e}
                      className="rounded-md p-2 text-xl hover:bg-chat"
                      aria-label={`Emoji ${e}`}
                      onClick={() => {
                        setTexto((t) => t + e);
                        campo.current?.focus();
                      }}
                    >
                      {e}
                    </button>
                  ),
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm">
                <Zap />
                Respostas rápidas
                <ChevronDown className="size-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-80">
              <p className="p-1 text-xs font-semibold text-ink-2">
                Escolha e revise antes de enviar
              </p>
              {rapidas.map((r) => (
                <button
                  key={r.nome}
                  onClick={() => {
                    setTexto(r.texto);
                    campo.current?.focus();
                  }}
                  className="rounded-md p-2 text-left hover:bg-chat"
                >
                  <span className="block text-sm font-semibold">{r.nome}</span>
                  <span className="mt-1 block text-xs leading-5 text-ink-2">{r.texto}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink-2">
          <input
            type="checkbox"
            checked={nota}
            onChange={(e) => {
              setNota(e.target.checked);
              setErro('');
            }}
            className="size-3.5 accent-noite"
          />
          <LockKeyhole className="size-3" />
          Nota interna
        </label>
      </div>
      {!nota && (janelaFechada || !detalhe.conversa.janelaAteEm) && (
        <p className="mb-2 flex items-start gap-1.5 rounded-control border border-pau-border bg-pau-bg p-2 text-xs text-pau-fg">
          <Clock3 className="mt-0.5 size-3.5 shrink-0" />
          {janelaFechada
            ? 'A última mensagem do cliente foi há mais de 24h. Revise o contexto antes de enviar.'
            : 'Este contato ainda não enviou uma mensagem. Confira o número antes de iniciar o atendimento.'}
        </p>
      )}
      {erro && (
        <div
          role="alert"
          className="mb-2 flex items-start gap-2 rounded-control border border-emg-border bg-emg-bg p-2 text-xs text-emg-fg"
        >
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>Mensagem não enviada. {erro}</span>
          <button className="ml-auto" aria-label="Fechar erro" onClick={() => setErro('')}>
            <X className="size-3.5" />
          </button>
        </div>
      )}
      <div
        className={cn(
          'flex items-end gap-2 rounded-control border p-2 focus-within:ring-2 focus-within:ring-sinal/30',
          nota ? 'border-nota-border bg-[#FFFCEF]' : 'border-line-control bg-panel',
        )}
      >
        <Textarea
          ref={campo}
          aria-label={nota ? 'Escrever nota interna' : 'Escrever mensagem'}
          placeholder={nota ? 'Escreva uma nota só para a equipe…' : 'Escreva sua mensagem…'}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              enviar();
            }
            if (e.key === '/' && !texto) {
              e.preventDefault();
              setTexto(rapidas[0].texto);
            }
          }}
          disabled={envio.isPending || (!nota && estado === 'ENCERRADA')}
          className="min-h-[48px] max-h-36 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0"
        />
        <Button
          aria-label={nota ? 'Salvar nota interna' : 'Enviar mensagem'}
          className="mb-0.5 h-9"
          disabled={!texto.trim() || envio.isPending || (!nota && estado === 'ENCERRADA')}
          onClick={enviar}
        >
          {envio.isPending ? (
            <LoaderCircle className="animate-spin" />
          ) : nota ? (
            <LockKeyhole />
          ) : (
            <Send />
          )}
          <span className="hidden sm:inline">{nota ? 'Salvar nota' : 'Enviar'}</span>
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-ink-3">
        {nota
          ? 'Esta nota não será enviada ao WhatsApp.'
          : estado === 'IA_ATIVA'
            ? 'Ao enviar, você assume a conversa e pausa as respostas da IA.'
            : 'Enter para enviar. Shift + Enter para quebrar linha.'}
      </p>
      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {restrito ? 'Confirmar envio manual?' : 'Enviar e assumir o atendimento?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {restrito
                ? 'Este contato está restrito para comunicações. Confirme que deseja enviar esta mensagem manualmente.'
                : 'A IA para de responder nesta conversa.'}{' '}
              Sua mensagem será enviada ao WhatsApp de{' '}
              {detalhe.contato.nome || detalhe.contato.telefoneExibicao}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="max-h-36 overflow-auto whitespace-pre-wrap rounded-control border bg-canvas p-3 text-sm">
            {texto}
          </p>
          {!restrito && (
            <label className="flex items-center gap-2 text-xs text-ink-2">
              <input
                type="checkbox"
                checked={naoPerguntar}
                onChange={(e) => setNaoPerguntar(e.target.checked)}
              />
              Não perguntar de novo nesta sessão
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              disabled={envio.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (naoPerguntar && !restrito)
                  sessionStorage.setItem('saleshub-nao-confirmar-assumir', '1');
                envio.mutate(restrito);
              }}
            >
              {restrito ? 'Confirmar e enviar' : 'Enviar e assumir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Contexto({
  detalhe,
  trilha,
  carregandoTrilha,
  erroTrilha,
  verMensagem,
}: {
  detalhe: ConversaDetalheDTO;
  trilha: TrilhaItemDTO[];
  carregandoTrilha: boolean;
  erroTrilha: boolean;
  atualizar: () => void;
  verMensagem: (id: string) => void;
}) {
  const [expandida, setExpandida] = useState<string | null>(null);
  const contato = detalhe.contato;
  function campo(
    rotulo: string,
    valor: string | number | null | undefined,
    ia?: { mensagemId: string | null; em: string },
  ) {
    return (
      <div key={rotulo} className="border-b border-line-subtle py-2.5 last:border-0">
        <dt className="mb-1 text-xs text-ink-3">{rotulo}</dt>
        <dd className="flex items-start justify-between gap-2 text-[13px] font-medium">
          {valor || 'Não informado'}
          {ia && (
            <button
              disabled={!ia.mensagemId}
              title={`Preenchido pela IA a partir da mensagem das ${hora(ia.em)}`}
              aria-label={`Ver origem de ${rotulo}`}
              onClick={() => ia.mensagemId && verMensagem(ia.mensagemId)}
              className="rounded p-0.5 text-ia-fg hover:bg-ia-bg"
            >
              <Bot className="size-3.5" />
            </button>
          )}
        </dd>
      </div>
    );
  }
  return (
    <>
      <section className="border-b p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Bot className="size-4 text-ia-fg" />
            Resumo da conversa
          </h3>
          <EmDesenvolvimento
            recurso="Atualizar o resumo"
            detalhe="Gerar de novo o resumo da conversa sob demanda faz parte da implantação completa. Neste protótipo, o resumo é atualizado pela IA ao longo do atendimento."
          >
            {(abrir) => (
              <button
                type="button"
                onClick={abrir}
                title="Atualizar resumo"
                aria-label="Atualizar resumo da conversa"
                className="rounded-control p-1.5 text-ink-3 transition-colors hover:bg-chat hover:text-ink focus-visible:ring-2 focus-visible:ring-sinal focus-visible:outline-none"
              >
                <RefreshCw className="size-3.5" />
              </button>
            )}
          </EmDesenvolvimento>
        </div>
        {detalhe.resumo ? (
          <>
            <p className="text-[13px] leading-[21px] text-ink-2">{detalhe.resumo.querOQue}</p>
            {detalhe.resumo.objecao && (
              <div className="mt-3 rounded-control border border-pau-border bg-pau-bg p-2.5 text-xs leading-5 text-pau-fg">
                <strong className="block">Ponto de atenção</strong>
                {detalhe.resumo.objecao}
              </div>
            )}
            <div className="mt-3 border-l-2 border-ia-border pl-3">
              <p className="text-xs font-semibold text-ia-fg">Próximo passo</p>
              <p className="mt-1 text-[13px] leading-5 text-ink-2">{detalhe.resumo.proximoPasso}</p>
            </div>
            <p className="mt-3 text-xs text-ink-3">
              Atualizado às {hora(detalhe.resumo.atualizadoEm)}
            </p>
          </>
        ) : (
          <p className="text-[13px] leading-5 text-ink-3">
            Ainda não há resumo desta conversa. O resumo automático estará disponível na implantação
            completa.
          </p>
        )}
      </section>
      <section className="border-b p-4">
        <Tabs defaultValue="contato">
          <TabsList variant="line" className="mb-2 w-full justify-start border-b">
            <TabsTrigger value="contato" className="text-xs">
              Contato
            </TabsTrigger>
            <TabsTrigger value="interesse" className="text-xs">
              Interesse
            </TabsTrigger>
            <TabsTrigger value="oportunidade" className="text-xs">
              Oportunidade
            </TabsTrigger>
            <TabsTrigger value="proposta" className="text-xs">
              Proposta
            </TabsTrigger>
          </TabsList>
          <TabsContent value="contato">
            <dl>
              {campo('Nome', contato.nome, contato.camposIa.nome)}
              {campo('WhatsApp', contato.telefoneExibicao)}
              {campo(
                'Cidade',
                contato.cidade ? `${contato.cidade}${contato.uf ? `, ${contato.uf}` : ''}` : null,
                contato.camposIa.cidade,
              )}
              {campo(
                'Origem',
                (
                  {
                    whatsapp_organico: 'WhatsApp orgânico',
                    site: 'Site',
                    campanha: 'Campanha',
                    indicacao: 'Indicação',
                    importacao: 'Importação',
                  } as Record<string, string>
                )[contato.origem],
              )}
              {campo(
                'Relacionamento',
                (
                  {
                    lead: 'Novo contato',
                    cliente_ativo: 'Cliente ativo',
                    ex_cliente: 'Ex-cliente',
                  } as Record<string, string>
                )[contato.statusCliente],
              )}
            </dl>
          </TabsContent>
          <TabsContent value="interesse">
            {detalhe.itens.length ? (
              detalhe.itens.map((item) => (
                <div key={item.id}>
                  <div className="mt-3 flex items-center gap-2 text-sm font-semibold">
                    <Package className="size-5 text-ink-3" />
                    {item.categoria ?? 'Interesse em qualificação'}
                  </div>
                  <dl>
                    {campo('Categoria', item.categoria, item.camposIa.categoria)}
                    {campo('Descrição', item.descricao, item.camposIa.descricao)}
                    {campo('Quantidade', item.quantidade, item.camposIa.quantidade)}
                  </dl>
                </div>
              ))
            ) : (
              <p className="py-4 text-[13px] text-ink-3">Nenhum interesse informado ainda.</p>
            )}
          </TabsContent>
          <TabsContent value="oportunidade">
            {detalhe.oportunidade ? (
              <dl>
                {campo('Etapa', ROTULOS_ETAPA[detalhe.oportunidade.etapa])}
                {campo(
                  'Interesse',
                  rotuloProduto(detalhe.oportunidade.produto),
                  detalhe.oportunidade.camposIa.produto,
                )}
                {campo(
                  'Solução atual',
                  detalhe.oportunidade.solucaoAtual,
                  detalhe.oportunidade.camposIa.solucaoAtual,
                )}
                {campo(
                  'Momento de compra',
                  detalhe.oportunidade.momentoCompra,
                  detalhe.oportunidade.camposIa.momentoCompra,
                )}
                {campo('Próxima ação', detalhe.oportunidade.proximaAcao)}
                {campo('Responsável', detalhe.oportunidade.responsavel?.nome)}
                {detalhe.oportunidade.objecoes.map((o) => campo('Objeção', o.descricao))}
              </dl>
            ) : (
              <p className="py-4 text-[13px] text-ink-3">
                A oportunidade será exibida aqui durante a qualificação.
              </p>
            )}
          </TabsContent>
          <TabsContent value="proposta">
            <div className="flex flex-col items-center gap-2 py-5 text-center">
              <FileText className="size-7 text-ink-3" />
              <p className="text-[13px] text-ink-2">Nenhuma proposta anexada à conversa.</p>
              <p className="text-xs text-ink-3">
                As propostas aprovadas ficam disponíveis para consulta aqui.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </section>
      <section className="p-4">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <MapPin className="size-4 text-ia-fg" />
            Trilha da IA
          </h3>
          <span className="rounded-md bg-chat px-1.5 py-0.5 text-xs text-ink-3">
            {trilha.length} ações
          </span>
        </div>
        {carregandoTrilha ? (
          <div className="space-y-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : erroTrilha ? (
          <p className="text-xs text-emg-fg">
            Não foi possível carregar a trilha. Atualize a conversa.
          </p>
        ) : !trilha.length ? (
          <p className="text-[13px] leading-5 text-ink-3">
            As decisões e os motivos da IA aparecerão aqui.
          </p>
        ) : (
          <ol className="ml-2 border-l-2 border-line">
            {[...trilha].reverse().map((t, i) => (
              <li key={t.id} className="relative pb-5 pl-5 last:pb-0">
                <span className="absolute -left-[8px] top-0 bg-panel py-0.5">
                  {i === 0 ? (
                    <MapPin className="size-4 text-ia-solid" />
                  ) : (
                    <span
                      className={cn(
                        'mx-0.5 block size-2.5 rounded-full',
                        t.tipo === 'acao_ia'
                          ? 'bg-ia-solid'
                          : t.tipo === 'controle'
                            ? 'bg-hum-solid'
                            : 'border-2 border-ink-disabled bg-panel',
                      )}
                    />
                  )}
                </span>
                <p className="text-[13px] font-semibold leading-5">{t.titulo}</p>
                <div className="mt-1 flex items-center gap-3">
                  <time className="text-xs text-ink-3 tabular-nums">{hora(t.em)}</time>
                  {(t.justificativa || t.mensagemOrigemId) && (
                    <button
                      aria-expanded={expandida === t.id}
                      className="text-xs font-semibold text-ia-fg hover:underline"
                      onClick={() => setExpandida(expandida === t.id ? null : t.id)}
                    >
                      Por quê?
                    </button>
                  )}
                </div>
                {expandida === t.id && (
                  <div className="mt-2 rounded-control border border-ia-border bg-ia-bg p-2.5 text-xs leading-5 text-ink-2">
                    {t.justificativa || 'Ação registrada no atendimento.'}
                    {t.mensagemOrigemId && (
                      <button
                        className="mt-2 flex items-center gap-1 font-semibold text-ia-fg hover:underline"
                        onClick={() => verMensagem(t.mensagemOrigemId!)}
                      >
                        <Reply className="size-3" />
                        Ver mensagem
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
