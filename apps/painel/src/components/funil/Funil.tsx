'use client';

import { useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Bot,
  CheckCheck,
  Clock3,
  ClockAlert,
  Flame,
  GripVertical,
  ListFilter,
  MessageSquareText,
  MoreHorizontal,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Siren,
  UserRound,
  XCircle,
} from 'lucide-react';
import {
  ETAPAS,
  ROTULOS_ETAPA,
  type Etapa,
  type MoverOportunidadeBody,
  type OportunidadeCardDTO,
  type OportunidadesPorEtapaDTO,
} from '@sales-hub/shared';
import { toast } from 'sonner';
import { bff } from '@/lib/bff';
import { chaves } from '@/lib/queries';
import { descreverItem, formatarDataRelativa, iniciais, rotuloProduto } from '@/lib/formatos';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DemoBadge } from '@/components/shell/DemoBadge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Rampa do padrão visual (§3.5): um só matiz do Novo lead à Contratação; venda em verde; perdido neutro. */
const CORES_ETAPA: Record<Etapa, string> = {
  novo_lead: '#2F379A',
  em_atendimento: '#4F5BD5',
  qualificacao_concluida: '#6670DC',
  aguardando_cotacao: '#7E87E3',
  proposta_enviada: '#979EEA',
  em_negociacao: '#B1B6F0',
  contratacao_em_andamento: '#C9CDF5',
  venda_confirmada: '#0F7A40',
  perdido: '#9CA3AF',
};
const estados = {
  IA_ATIVA: { nome: 'IA atendendo', cor: 'text-ia-fg bg-ia-bg', ponto: 'bg-ia-solid', Icon: Bot },
  HUMANO: { nome: 'Humano atendendo', cor: 'text-hum-fg bg-hum-bg', ponto: 'bg-hum-solid', Icon: UserRound },
  IA_PAUSADA: { nome: 'IA pausada', cor: 'text-pau-fg bg-pau-bg', ponto: 'bg-pau-solid', Icon: Clock3 },
  AGUARDANDO_ESPECIALISTA: {
    nome: 'Aguardando especialista',
    cor: 'text-esp-fg bg-esp-bg',
    ponto: 'bg-esp-solid',
    Icon: UserRound,
  },
  ENCERRADA: { nome: 'Encerrada', cor: 'text-ink-2 bg-chat', ponto: 'bg-ink-disabled', Icon: CheckCheck },
};
const TIPOS_EVIDENCIA = {
  contrato_assinado: 'Contrato assinado',
  pagamento_confirmado: 'Pagamento confirmado',
  confirmacao_sistema: 'Confirmação no sistema',
} as const;
type TipoEvidencia = keyof typeof TIPOS_EVIDENCIA;

/** Tempo da animação de saída do modal antes de o cartão andar (o modal some primeiro). */
const SAIDA_MODAL_MS = 190;

function moverNoCache(
  dados: OportunidadesPorEtapaDTO,
  id: string,
  para: Etapa,
): OportunidadesPorEtapaDTO {
  let alvo: OportunidadeCardDTO | undefined;
  const novo = {} as OportunidadesPorEtapaDTO;
  for (const etapa of Object.keys(dados) as Etapa[]) {
    const cards = dados[etapa] ?? [];
    alvo ??= cards.find((c) => c.id === id);
    novo[etapa] = cards.filter((c) => c.id !== id);
  }
  if (!alvo) return dados;
  novo[para] = [{ ...alvo, etapa: para, etapaDesde: new Date().toISOString() }, ...(novo[para] ?? [])];
  return novo;
}

export function Funil() {
  const client = useQueryClient();
  const q = useQuery({
    queryKey: chaves.oportunidades(),
    queryFn: () => bff.get<OportunidadesPorEtapaDTO>('oportunidades'),
  });
  const [busca, setBusca] = useState('');
  const [conducao, setConducao] = useState('todas');
  const [prazo, setPrazo] = useState('todos');
  const [movendo, setMovendo] = useState<{ card: OportunidadeCardDTO; para: Etapa } | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [tipoEvidencia, setTipoEvidencia] = useState<TipoEvidencia>('contrato_assinado');
  const [arrastando, setArrastando] = useState<OportunidadeCardDTO | null>(null);
  const [sobre, setSobre] = useState<Etapa | null>(null);
  const itens = useMemo(() => Object.values(q.data ?? {}).flat(), [q.data]);

  // Cartões que mudaram de etapa (aqui ou ao vivo, por opportunity.updated) ganham a animação de chegada.
  const vistos = useRef<Map<string, Etapa> | null>(null);
  const [chegadas, setChegadas] = useState<ReadonlySet<string>>(new Set());
  useLayoutEffect(() => {
    if (!q.data) return;
    const atual = new Map(itens.map((c) => [c.id, c.etapa] as const));
    const anterior = vistos.current;
    vistos.current = atual;
    if (!anterior) return;
    const novos = [...atual].filter(([id, etapa]) => anterior.get(id) !== etapa).map(([id]) => id);
    if (!novos.length) return;
    setChegadas((s) => new Set([...s, ...novos]));
    window.setTimeout(() => {
      setChegadas((s) => {
        const n = new Set(s);
        for (const id of novos) n.delete(id);
        return n;
      });
    }, 1000);
  }, [itens, q.data]);

  const filtrados = itens.filter(
    (c) =>
      (!busca ||
        `${c.contato.nome ?? ''} ${c.contato.e164} ${c.item?.categoria ?? ''} ${c.item?.descricao ?? ''} ${rotuloProduto(c.produto) ?? ''}`
          .toLowerCase()
          .includes(busca.toLowerCase())) &&
      (conducao === 'todas' || c.estadoConversa === conducao) &&
      (prazo === 'todos' || c.vencida),
  );
  const filtrando = !!busca || conducao !== 'todas' || prazo !== 'todos';

  const mutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: MoverOportunidadeBody }) =>
      bff.post(`oportunidades/${id}/mover`, body),
    onSuccess: async (_r, vars) => {
      const para = vars.body.para;
      toast.success(
        para === 'venda_confirmada'
          ? 'Venda confirmada com evidência.'
          : para === 'perdido'
            ? 'Perda registrada.'
            : `Oportunidade movida para ${ROTULOS_ETAPA[para]}.`,
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: ['oportunidades'] }),
        client.invalidateQueries({ queryKey: ['visao-geral'] }),
        client.invalidateQueries({ queryKey: ['conversas'] }),
      ]);
    },
  });

  function mover(card: OportunidadeCardDTO, para: Etapa) {
    if (card.etapa === para) return;
    setObservacao('');
    setTipoEvidencia('contrato_assinado');
    setMovendo({ card, para });
    setDialogAberto(true);
  }

  function confirmar() {
    if (!movendo) return;
    const { card, para } = movendo;
    const body: MoverOportunidadeBody = { para };
    if (para === 'perdido') body.motivoPerda = observacao.trim();
    if (para === 'venda_confirmada')
      body.evidencia = { tipo: tipoEvidencia, observacao: observacao.trim() };
    // 1) o modal sai primeiro; 2) depois da saída, o cartão anda (otimista); 3) o servidor confirma.
    setDialogAberto(false);
    window.setTimeout(async () => {
      const chave = chaves.oportunidades();
      await client.cancelQueries({ queryKey: chave });
      const antes = client.getQueryData<OportunidadesPorEtapaDTO>(chave);
      if (antes) client.setQueryData(chave, moverNoCache(antes, card.id, para));
      mutation.mutate(
        { id: card.id, body },
        {
          onError: (e: Error) => {
            if (antes) client.setQueryData(chave, antes);
            toast.error(`Não foi possível mover. ${e.message}`);
          },
        },
      );
    }, SAIDA_MODAL_MS);
  }

  function aoSoltar(e: DragEvent, etapa: Etapa) {
    e.preventDefault();
    setSobre(null);
    if (arrastando) mover(arrastando, etapa);
    setArrastando(null);
  }

  const exigeTexto = movendo?.para === 'perdido' || movendo?.para === 'venda_confirmada';

  return (
    <div className="flex h-full min-h-[600px] flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold text-ink-3">Operação comercial</p>
          <h1 className="text-[26px] leading-8 font-semibold tracking-tight">
            Cada oportunidade, um próximo passo.
          </h1>
          <p className="mt-2 text-sm text-ink-2">
            Acompanhe a jornada da negociação e mantenha o retorno em dia.
          </p>
        </div>
        <DemoBadge />
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-panel border border-line bg-panel p-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <Input
            aria-label="Buscar oportunidades"
            placeholder="Buscar contato, telefone ou interesse"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-9 bg-panel pl-9"
          />
        </div>
        <Select value={conducao} onValueChange={setConducao}>
          <SelectTrigger aria-label="Filtrar por condução" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as conduções</SelectItem>
            {Object.entries(estados).map(([v, s]) => (
              <SelectItem key={v} value={v}>
                <span className={cn('size-2 shrink-0 rounded-full', s.ponto)} aria-hidden />
                {s.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={prazo} onValueChange={setPrazo}>
          <SelectTrigger aria-label="Filtrar por prazo" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os prazos</SelectItem>
            <SelectItem value="vencidas">
              <ClockAlert className="text-emg-fg" />
              Somente vencidas
            </SelectItem>
          </SelectContent>
        </Select>
        {filtrando ? (
          <Button
            variant="ghost"
            onClick={() => {
              setBusca('');
              setConducao('todas');
              setPrazo('todos');
            }}
          >
            Limpar filtros
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="icon-lg"
          aria-label="Atualizar funil"
          title="Atualizar funil"
          onClick={() => q.refetch()}
        >
          <RefreshCw className={q.isFetching ? 'animate-spin' : ''} />
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
        <span className="flex items-center gap-2">
          <ListFilter className="size-4" />
          <span className="tabular">{filtrados.length}</span>
          {filtrados.length === 1 ? 'oportunidade' : 'oportunidades'}
          {filtrando ? ' com os filtros selecionados' : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <GripVertical className="size-3.5" aria-hidden />
          Arraste um cartão ou use o menu para mudar de etapa.
        </span>
      </div>

      {q.isError ? (
        <div
          role="alert"
          className="rounded-panel border border-emg-border bg-emg-bg p-5 text-emg-fg"
        >
          <p>Não foi possível carregar o funil. {q.error.message}</p>
          <Button className="mt-3" variant="outline" onClick={() => q.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : (
        <div
          className="funil-rolagem -mx-1 flex min-h-[380px] flex-1 items-stretch gap-4 overflow-x-auto overflow-y-hidden px-1 pb-3"
          aria-label="Etapas do funil"
        >
          {ETAPAS.map((etapa) => {
            const cards = filtrados.filter((c) => c.etapa === etapa);
            const vencidas = cards.filter((c) => c.vencida).length;
            const cor = CORES_ETAPA[etapa];
            const alvo = sobre === etapa && !!arrastando && arrastando.etapa !== etapa;
            return (
              <section
                key={etapa}
                aria-label={ROTULOS_ETAPA[etapa]}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (sobre !== etapa) setSobre(etapa);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(null);
                }}
                onDrop={(e) => aoSoltar(e, etapa)}
                className={cn(
                  'flex w-72 shrink-0 flex-col rounded-panel border bg-chat/45 transition-[background-color,border-color,box-shadow] duration-[160ms] ease-standard',
                  alvo ? 'border-sinal bg-ia-bg/70 ring-4 ring-sinal/10' : 'border-line',
                )}
              >
                <div className="relative shrink-0 overflow-hidden rounded-t-panel border-b border-line bg-panel px-4 pt-4 pb-3">
                  <span
                    className="absolute inset-x-0 top-0 h-[3px]"
                    style={{ background: cor }}
                    aria-hidden
                  />
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full ring-2 ring-white"
                      style={{ background: cor }}
                      aria-hidden
                    />
                    <h2 className="min-w-0 flex-1 truncate font-sans text-sm font-bold text-ink">
                      {ROTULOS_ETAPA[etapa]}
                    </h2>
                    <span className="min-w-6 rounded-full bg-chat px-2 py-0.5 text-center text-xs font-bold text-ink-2 tabular">
                      {q.isLoading ? '–' : cards.length}
                    </span>
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 pl-[18px] text-xs text-ink-3">
                    {vencidas > 0 ? (
                      <span className="flex items-center gap-1 font-semibold text-emg-fg">
                        <ClockAlert className="size-3.5" aria-hidden />
                        {vencidas} {vencidas === 1 ? 'vencida' : 'vencidas'}
                      </span>
                    ) : etapa === 'venda_confirmada' ? (
                      'Com evidência registrada'
                    ) : etapa === 'perdido' ? (
                      'Com motivo de perda'
                    ) : q.isLoading ? (
                      'Carregando…'
                    ) : cards.length ? (
                      'Todas em dia'
                    ) : (
                      'Sem oportunidades'
                    )}
                  </p>
                </div>
                <div className="funil-rolagem flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
                  {alvo ? (
                    <div
                      className="funil-alvo flex h-16 shrink-0 items-center justify-center gap-2 rounded-card border-2 border-dashed border-sinal/60 bg-panel/80 text-xs font-semibold text-sinal-forte"
                      aria-hidden
                    >
                      <ArrowRight className="size-4" />
                      Soltar em {ROTULOS_ETAPA[etapa]}
                    </div>
                  ) : null}
                  {q.isLoading ? (
                    [0, 1].map((k) => (
                      <div
                        key={k}
                        className="animate-pulse rounded-card border border-line bg-panel p-4"
                        aria-hidden
                      >
                        <div className="flex items-center gap-2">
                          <div className="size-8 rounded-full bg-chat" />
                          <div className="h-3 w-28 rounded bg-chat" />
                        </div>
                        <div className="mt-4 h-3 w-40 rounded bg-chat" />
                        <div className="mt-3 h-12 rounded bg-chat" />
                      </div>
                    ))
                  ) : cards.length ? (
                    cards.map((card) => (
                      <Cartao
                        key={card.id}
                        card={card}
                        cor={cor}
                        chegou={chegadas.has(card.id)}
                        arrastado={arrastando?.id === card.id}
                        onMove={(para) => mover(card, para)}
                        onDragStart={() => setArrastando(card)}
                        onDragEnd={() => {
                          setArrastando(null);
                          setSobre(null);
                        }}
                      />
                    ))
                  ) : !alvo ? (
                    <div className="flex flex-col items-center rounded-card border border-dashed border-line-control/70 px-4 py-6 text-center">
                      <div className="mb-2 flex size-8 items-center justify-center rounded-full bg-panel text-ink-3">
                        {etapa === 'venda_confirmada' ? (
                          <ShieldCheck className="size-4" />
                        ) : etapa === 'perdido' ? (
                          <XCircle className="size-4" />
                        ) : (
                          <ArrowRight className="size-4" />
                        )}
                      </div>
                      <p className="text-xs text-ink-3">
                        {filtrando && itens.length
                          ? 'Nenhuma oportunidade com estes filtros.'
                          : itens.length === 0
                            ? 'As novas oportunidades aparecem aqui.'
                            : 'Nenhuma oportunidade nesta etapa.'}
                      </p>
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {movendo?.para === 'venda_confirmada'
                ? 'Confirmar venda'
                : movendo?.para === 'perdido'
                  ? 'Registrar perda'
                  : 'Mover oportunidade'}
            </DialogTitle>
            <DialogDescription>
              {movendo?.card.contato.nome ?? movendo?.card.contato.e164 ?? 'Contato'} muda de
              etapa no funil.
            </DialogDescription>
          </DialogHeader>
          {movendo ? (
            <div className="flex items-center gap-2 rounded-card border border-line-subtle bg-canvas p-3">
              <ChipEtapa etapa={movendo.card.etapa} />
              <ArrowRight className="size-4 shrink-0 text-ink-3" aria-hidden />
              <ChipEtapa etapa={movendo.para} destaque />
            </div>
          ) : null}
          {movendo?.para === 'venda_confirmada' ? (
            <>
              <div className="flex gap-2 rounded-control border border-hum-border bg-hum-bg p-3 text-sm text-hum-fg">
                <ShieldCheck className="size-5 shrink-0" />
                Registre a evidência antes de incluir a venda nos indicadores.
              </div>
              <div className="space-y-2">
                <p id="funil-tipo-evidencia" className="text-sm font-semibold">
                  Tipo de evidência
                </p>
                <Select
                  value={tipoEvidencia}
                  onValueChange={(v) => setTipoEvidencia(v as TipoEvidencia)}
                >
                  <SelectTrigger
                    aria-labelledby="funil-tipo-evidencia"
                    size="lg"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPOS_EVIDENCIA).map(([v, rotulo]) => (
                      <SelectItem key={v} value={v}>
                        {rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}
          {exigeTexto ? (
            <label className="block text-sm font-semibold" htmlFor="funil-observacao">
              {movendo?.para === 'perdido' ? 'Motivo da perda' : 'Observação da evidência'}
              <textarea
                id="funil-observacao"
                autoFocus
                rows={4}
                className="mt-2 w-full resize-none rounded-control border border-line-control bg-panel p-3 font-normal transition-[border-color,box-shadow] duration-[120ms] placeholder:text-ink-3 hover:border-ink-3 focus-visible:border-sinal focus-visible:ring-2 focus-visible:ring-sinal/35 focus-visible:outline-none"
                placeholder={
                  movendo?.para === 'perdido'
                    ? 'O que impediu a contratação?'
                    : 'Identifique o contrato, pagamento ou registro confirmado.'
                }
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
              <span className="mt-1 block text-xs font-normal text-ink-3">
                Mínimo de 3 caracteres.
              </span>
            </label>
          ) : (
            <p className="text-ink-2">
              A alteração fica registrada no histórico desta oportunidade.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={confirmar}
              variant={movendo?.para === 'perdido' ? 'destructive' : 'default'}
              disabled={exigeTexto && observacao.trim().length < 3}
            >
              {movendo?.para === 'venda_confirmada'
                ? 'Confirmar venda'
                : movendo?.para === 'perdido'
                  ? 'Registrar perda'
                  : 'Confirmar movimentação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChipEtapa({ etapa, destaque }: { etapa: Etapa; destaque?: boolean }) {
  return (
    <span
      className={cn(
        'flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        destaque ? 'border-ia-border bg-panel text-ink' : 'border-line bg-panel text-ink-2',
      )}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: CORES_ETAPA[etapa] }}
        aria-hidden
      />
      <span className="truncate">{ROTULOS_ETAPA[etapa]}</span>
    </span>
  );
}

function Cartao({
  card,
  cor,
  chegou,
  arrastado,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  card: OportunidadeCardDTO;
  cor: string;
  chegou: boolean;
  arrastado: boolean;
  onMove: (etapa: Etapa) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const estado = card.estadoConversa ? estados[card.estadoConversa] : null;
  const recente =
    card.movidaPelaIaEm && Date.now() - new Date(card.movidaPelaIaEm).getTime() < 86400000;
  const nome = card.contato.nome ?? card.contato.e164;
  const interesse = card.item
    ? descreverItem(card.item) || 'Interesse em qualificação'
    : 'Interesse a identificar';
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.id);
        // um quadro depois, para a imagem do arraste sair nítida (sem o estilo de "arrastado")
        requestAnimationFrame(onDragStart);
      }}
      onDragEnd={() => requestAnimationFrame(onDragEnd)}
      aria-label={`Oportunidade de ${nome}`}
      className={cn(
        'group/cartao relative shrink-0 cursor-grab overflow-hidden rounded-card border border-line bg-panel py-3.5 pr-3.5 pl-4 transition-[transform,box-shadow,border-color,opacity] duration-[160ms] ease-standard hover:-translate-y-0.5 hover:border-line-control/50 hover:shadow-e1 active:cursor-grabbing',
        arrastado && 'scale-[.98] cursor-grabbing border-dashed border-sinal/60 opacity-45 shadow-none',
        chegou && 'funil-chegada',
      )}
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: cor }}
        aria-hidden
      />
      <div className="flex items-start gap-2.5">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ia-bg text-xs font-bold text-ia-fg"
          aria-hidden
        >
          {card.contato.nome ? iniciais(card.contato.nome) : <UserRound className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-sans text-sm leading-5 font-bold text-ink" title={nome}>
            {card.conversationId ? (
              <Link
                href={`/atendimento?c=${card.conversationId}`}
                draggable={false}
                className="rounded-chip decoration-sinal/50 underline-offset-2 hover:text-sinal-forte hover:underline focus-visible:ring-2 focus-visible:ring-sinal focus-visible:outline-none"
              >
                {nome}
              </Link>
            ) : (
              nome
            )}
          </h3>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-ink-2">
            <Package className="size-3.5 shrink-0 text-ink-3" aria-hidden />
            <span className="truncate" title={interesse}>
              {interesse}
            </span>
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="-mt-0.5 -mr-1 rounded-control p-1.5 text-ink-3 transition-colors duration-[120ms] hover:bg-chat hover:text-ink focus-visible:ring-2 focus-visible:ring-sinal focus-visible:outline-none data-[state=open]:bg-chat data-[state=open]:text-ink"
              aria-label={`Ações de ${card.contato.nome ?? 'oportunidade'}`}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Mover para</DropdownMenuLabel>
            {ETAPAS.filter((e) => e !== card.etapa).map((e) => (
              <DropdownMenuItem key={e} onClick={() => onMove(e)}>
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: CORES_ETAPA[e] }}
                  aria-hidden
                />
                {ROTULOS_ETAPA[e]}
              </DropdownMenuItem>
            ))}
            {card.conversationId ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={`/atendimento?c=${card.conversationId}`}>
                    <MessageSquareText />
                    Abrir conversa
                  </Link>
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="rounded-chip bg-chat px-2 py-0.5 text-xs font-semibold text-ink-2">
          {rotuloProduto(card.produto) ?? 'Produto em qualificação'}
        </span>
        {card.prioridade === 'emergencia' ? (
          <span className="flex items-center gap-1 rounded-chip bg-emg-bg px-2 py-0.5 text-xs font-semibold text-emg-fg">
            <Siren className="size-3" aria-hidden />
            Emergência
          </span>
        ) : card.prioridade === 'alta' ? (
          <span className="flex items-center gap-1 rounded-chip bg-pau-bg px-2 py-0.5 text-xs font-semibold text-pau-fg">
            <Flame className="size-3" aria-hidden />
            Prioridade alta
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          'mt-3 rounded-chip px-2.5 py-2 text-xs',
          card.vencida ? 'bg-emg-bg text-emg-fg' : 'bg-canvas text-ink-2',
        )}
      >
        <p className="line-clamp-2 font-semibold">{card.proximaAcao ?? 'Definir próximo passo'}</p>
        <p className="mt-1 flex items-center gap-1.5">
          {card.vencida ? (
            <ClockAlert className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <Clock3 className="size-3.5 shrink-0 text-ink-3" aria-hidden />
          )}
          <span className="tabular">
            {card.proximaAcaoEm ? formatarDataRelativa(card.proximaAcaoEm) : 'Sem prazo definido'}
          </span>
          {card.vencida ? <span className="font-semibold">(vencida)</span> : null}
        </p>
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-line-subtle pt-3">
        <span
          title={card.responsavel?.nome ?? 'Sem responsável'}
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sunken text-[11px] font-semibold text-ink-2"
        >
          {card.responsavel ? iniciais(card.responsavel.nome) : <UserRound className="size-3.5" />}
        </span>
        {estado ? (
          <span
            className={cn(
              'flex min-w-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold',
              estado.cor,
            )}
          >
            <span className={cn('size-1.5 shrink-0 rounded-full', estado.ponto)} aria-hidden />
            <span className="truncate">{estado.nome}</span>
          </span>
        ) : (
          <span className="text-xs text-ink-3">Sem conversa</span>
        )}
        {recente ? (
          <span
            className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-full bg-ia-bg text-sinal"
            title="Movida pela IA nas últimas 24 horas"
          >
            <Bot className="size-3.5" aria-label="Movida pela IA nas últimas 24 horas" />
          </span>
        ) : null}
      </div>
    </article>
  );
}
