'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bot,
  CalendarDays,
  CheckCheck,
  Clock3,
  Info,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Siren,
  Sparkles,
  Target,
  UserRound,
} from 'lucide-react';
import {
  ETAPAS,
  ROTULOS_ETAPA,
  type Etapa,
  type IndicadorDTO,
  type ListaConversasDTO,
  type VisaoGeralDTO,
} from '@sales-hub/shared';
import { bff } from '@/lib/bff';
import { chaves } from '@/lib/queries';
import {
  formatarDataRelativa,
  formatarDuracaoMin,
  formatarNumero,
  formatarPercentual,
} from '@/lib/formatos';
import { Button } from '@/components/ui/button';
import { DemoBadge } from '@/components/shell/DemoBadge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const etapaCores = [
  '#2F379A',
  '#4F5BD5',
  '#6670DC',
  '#7E87E3',
  '#979EEA',
  '#B1B6F0',
  '#C9CDF5',
  '#0F7A40',
  '#9CA3AF',
];
/** Cor pela etapa (não pela posição na lista), para não trocar cores se o funil vier parcial. */
const corEtapa = (e: Etapa) => etapaCores[ETAPAS.indexOf(e)] ?? '#9CA3AF';
function valor(i: IndicadorDTO) {
  if (i.valor === null) return '—';
  return i.formato === 'percentual'
    ? formatarPercentual(i.valor)
    : i.formato === 'duracao_min'
      ? formatarDuracaoMin(i.valor)
      : formatarNumero(i.valor);
}

export function VisaoGeral() {
  const [periodo, setPeriodo] = useState<7 | 30 | 90>(30);
  const q = useQuery({
    queryKey: chaves.visaoGeral(periodo),
    queryFn: () => bff.get<VisaoGeralDTO>(`visao-geral?periodo=${periodo}`),
  });
  const atividade = useQuery({
    queryKey: chaves.conversas('todas', ''),
    queryFn: () => bff.get<ListaConversasDTO>('conversas?filtro=todas&limite=50'),
  });
  const d = q.data;
  const total = d ? d.atribuicao.ia + d.atribuicao.humano + d.atribuicao.misto : 0;
  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink-3">
            <span className="h-px w-5 bg-sinal" />
            Sua operação, em perspectiva
          </div>
          <h1 className="font-display text-[28px] font-bold leading-[34px] tracking-[-.02em]">
            Bom trabalho começa com clareza.
          </h1>
          <p className="mt-2 text-sm text-ink-2">
            Acompanhe as oportunidades e saiba onde sua equipe faz a diferença.
          </p>
        </div>
        <Select value={String(periodo)} onValueChange={(v) => setPeriodo(Number(v) as 7 | 30 | 90)}>
          <SelectTrigger aria-label="Período dos indicadores" className="w-52">
            <span className="flex min-w-0 items-center gap-2">
              <CalendarDays className="text-ink-3" />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </header>
      {q.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-emg-border bg-emg-bg p-4"
        >
          <p className="text-emg-fg">Não foi possível carregar a visão geral. {q.error.message}</p>
          <Button variant="outline" onClick={() => q.refetch()}>
            <RefreshCw />
            Tentar de novo
          </Button>
        </div>
      ) : null}
      {q.isLoading ? (
        <div className="grid gap-6 lg:grid-cols-3" aria-label="Carregando visão geral">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 rounded-panel border border-line bg-panel p-6">
              <div className="h-4 w-36 rounded bg-chat" />
              <div className="mt-6 h-28 rounded bg-canvas" />
            </div>
          ))}
        </div>
      ) : d ? (
        <>
          {d.temDadosDemo ? (
            <div className="flex flex-wrap items-center gap-3">
              <DemoBadge />
              <span className="text-xs text-ink-3">
                Ambiente de apresentação. Indicadores incluem registros fictícios.
              </span>
            </div>
          ) : null}
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
            <div className="space-y-6">
              <section className="overflow-hidden rounded-panel border border-line bg-panel">
                <div className="flex items-center justify-between border-b border-line-subtle p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-card bg-pau-bg text-pau-fg">
                      <Target className="size-5" />
                    </div>
                    <div>
                      <h2 className="text-[17px] font-semibold">Prioridades de hoje</h2>
                      <p className="text-xs text-ink-3">Seu próximo passo está aqui</p>
                    </div>
                  </div>
                  <span className="rounded-chip bg-chat px-2 py-1 text-xs font-bold tabular">
                    {d.prioridades.length}
                  </span>
                </div>
                <div className="divide-y divide-line-subtle">
                  {d.prioridades.length ? (
                    d.prioridades.slice(0, 6).map((p, i) => (
                      <div key={`${p.tipo}-${i}`} className="flex items-center gap-3 px-5 py-4">
                        <span
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-full',
                            p.tipo === 'emergencia_aberta'
                              ? 'bg-emg-bg text-emg-fg'
                              : p.tipo === 'transferencia_sem_resposta'
                                ? 'bg-esp-bg text-esp-fg'
                                : 'bg-pau-bg text-pau-fg',
                          )}
                        >
                          {p.tipo === 'emergencia_aberta' ? (
                            <Siren className="size-4" />
                          ) : p.tipo === 'transferencia_sem_resposta' ? (
                            <UserRound className="size-4" />
                          ) : (
                            <Clock3 className="size-4" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">
                            {p.contatoNome ?? 'Oportunidade comercial'}
                          </p>
                          <p className="mt-0.5 text-sm text-ink-2">{p.descricao}</p>
                          <p className="mt-1 text-xs text-ink-3">{formatarDataRelativa(p.desde)}</p>
                        </div>
                        <Button asChild variant="ghost" className="text-sinal-forte">
                          <Link
                            href={
                              p.conversationId ? `/atendimento?c=${p.conversationId}` : '/funil'
                            }
                          >
                            <span className="hidden sm:inline">
                              {p.conversationId ? 'Abrir conversa' : 'Ver oportunidade'}
                            </span>
                            <ArrowRight />
                          </Link>
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="flex gap-3 p-6">
                      <CheckCheck className="size-6 text-hum-fg" />
                      <div>
                        <p className="font-semibold">Tudo em dia por aqui</p>
                        <p className="mt-1 text-ink-2">
                          Quando uma oportunidade precisar de atenção, ela aparece nesta lista.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>
              <section className="rounded-panel border border-line bg-panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[17px] font-semibold">Do primeiro contato à venda</h2>
                    <p className="mt-1 text-xs text-ink-3">
                      Distribuição das oportunidades no funil comercial
                    </p>
                  </div>
                  <Button asChild variant="ghost" className="text-sinal-forte">
                    <Link href="/funil">
                      Ver funil
                      <ArrowRight />
                    </Link>
                  </Button>
                </div>
                <div
                  className="mt-6 flex h-3 overflow-hidden rounded-full bg-chat"
                  aria-hidden="true"
                >
                  {d.funil.map((f) => (
                    <div
                      key={f.etapa}
                      title={`${ROTULOS_ETAPA[f.etapa]}: ${f.contagem}`}
                      style={{
                        width: `${
                          (f.contagem /
                            Math.max(
                              d.funil.reduce((s, x) => s + x.contagem, 0),
                              1,
                            )) *
                          100
                        }%`,
                        backgroundColor: corEtapa(f.etapa),
                      }}
                    />
                  ))}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3">
                  {d.funil.map((f) => (
                    <div key={f.etapa} className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2 text-xs text-ink-2">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: corEtapa(f.etapa) }}
                        />
                        <span className="truncate" title={ROTULOS_ETAPA[f.etapa]}>
                          {ROTULOS_ETAPA[f.etapa]}
                        </span>
                      </div>
                      <div className="mt-1 flex items-baseline gap-2 pl-4">
                        <strong className="font-display text-xl tabular">{f.contagem}</strong>
                        {f.conversaoProxima !== null ? (
                          <span className="text-xs text-ink-3">
                            {formatarPercentual(f.conversaoProxima, 0)} avançam
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-panel border border-line bg-panel p-5">
                <div className="flex items-center gap-2">
                  <Activity className="size-4 text-sinal" />
                  <h2 className="text-[17px] font-semibold">Conversas em movimento</h2>
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-3">
                    <Clock3 className="size-3.5" />
                    Recentes
                  </span>
                </div>
                <div className="mt-4 divide-y divide-line-subtle">
                  {atividade.isError ? (
                    <p className="py-4 text-ink-2">
                      Atividade indisponível.{' '}
                      <button
                        type="button"
                        onClick={() => atividade.refetch()}
                        className="font-semibold text-sinal-forte underline-offset-2 hover:underline"
                      >
                        Tentar de novo
                      </button>
                    </p>
                  ) : atividade.isLoading ? (
                    <p className="py-4 text-ink-3">Carregando conversas…</p>
                  ) : atividade.data?.itens.length ? (
                    atividade.data.itens.slice(0, 4).map((c) => (
                      <Link
                        href={`/atendimento?c=${c.id}`}
                        key={c.id}
                        className="-mx-2 flex items-center gap-3 rounded-control px-2 py-3 transition-colors duration-[120ms] hover:bg-canvas focus-visible:ring-2 focus-visible:ring-sinal focus-visible:outline-none"
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-chat text-ink-2">
                          <MessageSquare className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">
                            {c.contato.nome ?? c.contato.telefoneExibicao}
                          </p>
                          <p className="truncate text-xs text-ink-2">
                            {c.ultimaMensagem?.texto ?? 'Conversa iniciada'}
                          </p>
                        </div>
                        {c.estado === 'IA_ATIVA' ? (
                          <Bot className="size-4 shrink-0 text-sinal" />
                        ) : (
                          <UserRound className="size-4 shrink-0 text-ink-3" />
                        )}
                        <time className="text-xs text-ink-3">
                          {formatarDataRelativa(c.ultimaMensagemEm)}
                        </time>
                      </Link>
                    ))
                  ) : (
                    <p className="py-4 text-ink-2">
                      As próximas conversas recebidas aparecem aqui.
                    </p>
                  )}
                </div>
              </section>
            </div>
            <aside className="space-y-6">
              <section className="rounded-panel border border-line bg-panel">
                <div className="border-b border-line-subtle p-5">
                  <h2 className="text-[17px] font-semibold">Pulso da operação</h2>
                  <p className="mt-1 text-xs text-ink-3">
                    Últimos {periodo} dias, comparados ao período anterior
                  </p>
                </div>
                <div className="divide-y divide-line-subtle px-5">
                  {d.indicadores.map((i) => (
                    <div key={i.chave} className="py-4">
                      <div className="flex items-center gap-2 text-sm text-ink-2">
                        {i.nome}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              aria-label={`Entender ${i.nome}`}
                              className="ml-auto rounded-chip p-1 text-ink-3 transition-colors hover:bg-chat hover:text-ink focus-visible:ring-2 focus-visible:ring-sinal focus-visible:outline-none"
                            >
                              <Info className="size-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="space-y-2 text-xs">
                            <p className="font-semibold">{i.nome}</p>
                            <p>{i.definicao}</p>
                            <p>Período: {i.periodo}</p>
                            <p>Origem: {i.origem}</p>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="mt-2 flex items-baseline justify-between gap-2">
                        <strong className="font-display text-[26px] font-semibold leading-8 tabular tracking-tight">
                          {valor(i)}
                        </strong>
                        {i.variacao !== null ? (
                          <span
                            className={cn(
                              'flex items-center gap-1 text-xs font-semibold',
                              i.variacao >= 0 ? 'text-hum-fg' : 'text-pau-fg',
                            )}
                          >
                            {i.variacao >= 0 ? (
                              <ArrowUp className="size-3" />
                            ) : (
                              <ArrowDown className="size-3" />
                            )}
                            {formatarPercentual(Math.abs(i.variacao))}
                          </span>
                        ) : (
                          <span className="text-xs text-ink-3">Sem comparação</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-panel border border-line bg-panel p-5">
                <h2 className="text-[17px] font-semibold">Quem ajudou a vender</h2>
                <p className="mt-1 text-xs text-ink-3">Atribuição das {total} vendas confirmadas</p>
                <div
                  className="my-5 flex h-3 overflow-hidden rounded-full bg-chat"
                  role="img"
                  aria-label={`${d.atribuicao.ia} vendas da IA, ${d.atribuicao.humano} humanas e ${d.atribuicao.misto} mistas`}
                >
                  {[
                    { v: d.atribuicao.ia, c: 'bg-ia-solid' },
                    { v: d.atribuicao.humano, c: 'bg-hum-solid' },
                    { v: d.atribuicao.misto, c: 'bg-misto' },
                  ].map((x, i) => (
                    <span
                      key={i}
                      className={x.c}
                      style={{ width: `${(x.v / Math.max(total, 1)) * 100}%` }}
                    />
                  ))}
                </div>
                <div className="space-y-3">
                  {[
                    { n: 'IA', v: d.atribuicao.ia, c: 'bg-ia-solid', I: Bot },
                    { n: 'Equipe', v: d.atribuicao.humano, c: 'bg-hum-solid', I: UserRound },
                    { n: 'IA + equipe', v: d.atribuicao.misto, c: 'bg-misto', I: Sparkles },
                  ].map((x) => (
                    <div key={x.n} className="flex items-center gap-2 text-sm">
                      <span className={cn('size-2 rounded-full', x.c)} />
                      <x.I className="size-4 text-ink-3" />
                      <span>{x.n}</span>
                      <strong className="ml-auto tabular">{x.v}</strong>
                      <span className="w-10 text-right text-xs text-ink-3">
                        {formatarPercentual(x.v / Math.max(total, 1), 0)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex gap-2 border-t border-line-subtle pt-4 text-xs text-ink-3">
                  <ShieldCheck className="size-4 shrink-0" />A venda só entra na contagem depois da
                  confirmação com evidência.
                </div>
              </section>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}
