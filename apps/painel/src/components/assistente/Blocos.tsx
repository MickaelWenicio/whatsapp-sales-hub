'use client';

import { Fragment, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRightLeft,
  Building2,
  ClipboardPlus,
  Clock3,
  ClockAlert,
  MessageSquare,
  UserRound,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DemoBadge } from '@/components/shell/DemoBadge';
import { PacoteIcon } from '@/components/icons/PacoteIcon';
import { iniciais } from '@/lib/formatos';
import { cn } from '@/lib/utils';
import { useAcoesAssistente } from './contexto';
import {
  corEtapa,
  orcamentos,
  palavras,
  type Bloco,
  type Resposta,
  type TipoInteresse,
} from './respostas';

/** Conteúdo de uma resposta, com `visiveis` palavras já escritas (`null` = tudo). */
export function ConteudoResposta({
  resposta,
  visiveis,
  escrevendo,
}: {
  resposta: Resposta;
  visiveis: number | null;
  escrevendo: boolean;
}) {
  const orc = orcamentos(resposta, visiveis);
  return (
    <div className="@container space-y-5">
      {resposta.blocos.map((bloco, i) => {
        const disponivel = orc[i] ?? 0;
        if (disponivel <= 0) return null;
        return (
          <BlocoResposta key={i} bloco={bloco} disponivel={disponivel} escrevendo={escrevendo} />
        );
      })}
    </div>
  );
}

function BlocoResposta({
  bloco,
  disponivel,
  escrevendo,
}: {
  bloco: Bloco;
  disponivel: number;
  escrevendo: boolean;
}) {
  // Blocos visuais entram com um fade curto só enquanto a resposta está sendo escrita.
  const entrada = escrevendo ? 'animate-in fade-in-0 duration-300' : undefined;
  switch (bloco.tipo) {
    case 'paragrafo':
      return (
        <p className="max-w-[68ch] text-[15px] leading-[22px] text-ink">
          <TextoRico texto={bloco.texto} limite={disponivel} cursor={escrevendo} />
        </p>
      );
    case 'topicos':
      return <Topicos bloco={bloco} disponivel={disponivel} escrevendo={escrevendo} />;
    case 'tabela':
      return <Tabela bloco={bloco} className={entrada} />;
    case 'barras':
      return <Barras bloco={bloco} className={entrada} />;
    case 'indicadores':
      return <Indicadores bloco={bloco} className={entrada} />;
    case 'leads':
      return <Leads bloco={bloco} className={entrada} />;
    case 'confirmacao':
      return <Confirmacao bloco={bloco} className={entrada} />;
    case 'acoes':
      return <Acoes bloco={bloco} className={entrada} />;
    case 'sugestoes':
      return <Sugestoes bloco={bloco} className={entrada} />;
  }
}

// ─── Texto ──────────────────────────────────────────────────────────────────

function TextoRico({ texto, limite, cursor }: { texto: string; limite: number; cursor: boolean }) {
  const todas = palavras(texto);
  const visiveis = todas.slice(0, limite);
  return (
    <>
      {visiveis.map((p, i) => (
        <Fragment key={i}>
          {p.espaco ? ' ' : null}
          {p.forte ? <strong className="font-bold text-ink">{p.t}</strong> : p.t}
        </Fragment>
      ))}
      {cursor && visiveis.length < todas.length ? <Cursor /> : null}
    </>
  );
}

function Cursor() {
  return (
    <span
      aria-hidden="true"
      className="ml-1 inline-block size-2.5 translate-y-[1px] rounded-full bg-sinal align-middle"
    />
  );
}

function Topicos({
  bloco,
  disponivel,
  escrevendo,
}: {
  bloco: Extract<Bloco, { tipo: 'topicos' }>;
  disponivel: number;
  escrevendo: boolean;
}) {
  let resto = disponivel - (bloco.titulo ? 1 : 0);
  return (
    <div className="max-w-[68ch]">
      {bloco.titulo ? (
        <h3 className="mb-2 font-sans text-sm leading-5 font-bold text-ink">{bloco.titulo}</h3>
      ) : null}
      <ul className="space-y-2">
        {bloco.itens.map((item, i) => {
          if (resto <= 0) return null;
          const limite = resto;
          resto -= palavras(item).length;
          return (
            <li key={i} className="relative pl-5 text-[15px] leading-[22px] text-ink">
              <span
                aria-hidden="true"
                className="absolute top-[9px] left-1 size-1.5 rounded-full bg-sinal"
              />
              <TextoRico texto={item} limite={limite} cursor={escrevendo} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Cartões de relatório ───────────────────────────────────────────────────

function CartaoRelatorio({
  titulo,
  legenda,
  children,
  className,
}: {
  titulo: string;
  legenda?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-card border border-line bg-panel', className)}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line-subtle px-4 py-3">
        <div className="min-w-0">
          <h3 className="font-sans text-sm leading-5 font-bold text-ink">{titulo}</h3>
          {legenda ? <p className="text-xs leading-4 font-medium text-ink-3">{legenda}</p> : null}
        </div>
        <DemoBadge />
      </header>
      {children}
    </section>
  );
}

function Tabela({
  bloco,
  className,
}: {
  bloco: Extract<Bloco, { tipo: 'tabela' }>;
  className?: string;
}) {
  return (
    <CartaoRelatorio titulo={bloco.titulo} legenda={bloco.legenda} className={className}>
      <div className="overflow-x-auto">
        <table className="tabular w-full text-sm">
          <thead>
            <tr className="bg-canvas">
              {bloco.colunas.map((c, i) => (
                <th
                  key={c}
                  scope="col"
                  className={cn(
                    'h-9 px-4 text-xs font-semibold whitespace-nowrap text-ink-3',
                    i === 0 ? 'text-left' : 'text-right',
                  )}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {bloco.linhas.map((linha, r) => {
              const destaque = bloco.destaque === r;
              return (
                <tr key={r} className="h-10">
                  {linha.map((valor, i) =>
                    i === 0 ? (
                      <th
                        key={i}
                        scope="row"
                        className={cn(
                          'px-4 text-left font-medium whitespace-nowrap text-ink',
                          destaque && 'font-bold',
                        )}
                      >
                        <span className="inline-flex items-center gap-2.5">
                          {bloco.marcadores?.[r] ? (
                            <span
                              aria-hidden="true"
                              className="size-2.5 shrink-0 rounded-[3px]"
                              style={{ backgroundColor: bloco.marcadores[r] }}
                            />
                          ) : null}
                          {valor}
                        </span>
                      </th>
                    ) : (
                      <td
                        key={i}
                        className={cn(
                          'px-4 text-right whitespace-nowrap text-ink-2',
                          destaque && 'font-bold text-ink',
                        )}
                      >
                        {valor}
                      </td>
                    ),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CartaoRelatorio>
  );
}

function Barras({
  bloco,
  className,
}: {
  bloco: Extract<Bloco, { tipo: 'barras' }>;
  className?: string;
}) {
  const maximo = Math.max(...bloco.itens.map((i) => i.valor), 1);
  const [rotulo, quantidade, detalhe] = bloco.cabecalho;
  return (
    <CartaoRelatorio titulo={bloco.titulo} legenda={bloco.legenda} className={className}>
      <table className="tabular w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[44%] @lg:w-[13rem]" />
          <col />
          <col className="w-[4.5rem]" />
          <col className="w-[6rem]" />
        </colgroup>
        <thead>
          <tr className="bg-canvas text-xs font-semibold text-ink-3">
            <th scope="col" className="h-9 pl-4 text-left font-semibold">
              {rotulo}
            </th>
            <th scope="col" className="font-semibold">
              <span className="sr-only">Proporção</span>
            </th>
            <th scope="col" className="text-right font-semibold">
              {quantidade}
            </th>
            <th scope="col" className="pr-4 text-right font-semibold">
              {detalhe}
            </th>
          </tr>
        </thead>
        <tbody>
          {bloco.itens.map((item) => {
            const largura = `${Math.max(4, Math.round((item.valor / maximo) * 100))}%`;
            const cor =
              bloco.tom === 'neutro' ? (item.destaque ? 'bg-noite' : 'bg-[#C4C9D1]') : 'bg-sinal';
            return (
              <tr key={item.rotulo}>
                <th
                  scope="row"
                  className="py-2.5 pr-3 pl-4 text-left leading-5 font-medium text-ink"
                >
                  {item.rotulo}
                </th>
                <td className="py-2.5" aria-hidden="true">
                  <div className="h-2.5 w-full rounded-full bg-sunken">
                    <div className={cn('h-full rounded-full', cor)} style={{ width: largura }} />
                  </div>
                </td>
                <td className="py-2.5 text-right font-semibold text-ink">{item.valorTexto}</td>
                <td
                  className={cn(
                    'py-2.5 pr-4 text-right text-ink-2',
                    item.destaque && bloco.tom === 'sinal' && 'font-bold text-sinal-forte',
                  )}
                >
                  {item.detalhe}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </CartaoRelatorio>
  );
}

function Indicadores({
  bloco,
  className,
}: {
  bloco: Extract<Bloco, { tipo: 'indicadores' }>;
  className?: string;
}) {
  return (
    <CartaoRelatorio titulo={bloco.titulo} legenda={bloco.legenda} className={className}>
      <dl className="grid grid-cols-2 gap-px bg-line-subtle @2xl:grid-cols-4">
        {bloco.itens.map((item) => (
          <div key={item.rotulo} className="flex flex-col bg-panel px-4 py-3.5">
            <dt className="text-xs leading-4 font-semibold text-ink-3">{item.rotulo}</dt>
            <dd className="tabular mt-1.5 font-display text-[22px] leading-7 font-semibold tracking-[-0.02em] text-ink">
              {item.valor}
            </dd>
            <dd className="mt-0.5 text-xs leading-4 font-medium text-ink-3">{item.detalhe}</dd>
          </div>
        ))}
      </dl>
    </CartaoRelatorio>
  );
}

// ─── Leads e funil ──────────────────────────────────────────────────────────

const classeChip =
  'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-chip border border-line bg-panel px-2.5 text-[13px] font-semibold text-ink-2 transition-colors duration-[120ms] outline-none hover:border-line-control hover:bg-chat hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5 [&_svg]:shrink-0';

function IconeInteresse({ tipo }: { tipo: TipoInteresse }) {
  if (tipo === 'projeto') return <PacoteIcon size={14} className="shrink-0" />;
  if (tipo === 'empresa')
    return <Building2 className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />;
  return <UserRound className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />;
}

function EtapaPill({ etapa }: { etapa: string }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-canvas px-2 text-xs font-semibold text-ink-2">
      <span
        aria-hidden="true"
        className="size-2 rounded-full"
        style={{ backgroundColor: corEtapa(etapa) }}
      />
      {etapa}
    </span>
  );
}

function Leads({
  bloco,
  className,
}: {
  bloco: Extract<Bloco, { tipo: 'leads' }>;
  className?: string;
}) {
  const { emDesenvolvimento } = useAcoesAssistente();
  return (
    <CartaoRelatorio titulo={bloco.titulo} legenda={bloco.legenda} className={className}>
      <ul className="divide-y divide-line-subtle">
        {bloco.itens.map((lead) => (
          <li key={lead.nome} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-xs font-semibold text-[#374151]"
            >
              {iniciais(lead.nome)}
            </span>
            <div className="min-w-[12rem] flex-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="text-sm leading-5 font-bold text-ink">{lead.nome}</span>
                <EtapaPill etapa={lead.etapa} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] leading-[18px] font-medium">
                <span className="inline-flex items-center gap-1.5 text-ink-3">
                  <IconeInteresse tipo={lead.tipoInteresse} />
                  {lead.interesse}
                </span>
                <span className="inline-flex items-center gap-1.5 text-pau-fg">
                  <Clock3 className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  {lead.semRetorno}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/atendimento" className={classeChip}>
                <MessageSquare strokeWidth={1.75} aria-hidden="true" />
                Abrir conversa
              </Link>
              <button
                type="button"
                className={classeChip}
                onClick={() =>
                  emDesenvolvimento(
                    'Criar tarefa',
                    'Na próxima fase, o assistente cria a tarefa de retomada com prazo e responsável, e ela aparece no cartão da oportunidade.',
                  )
                }
              >
                <ClipboardPlus strokeWidth={1.75} aria-hidden="true" />
                Criar tarefa
              </button>
            </div>
          </li>
        ))}
      </ul>
    </CartaoRelatorio>
  );
}

function Confirmacao({
  bloco,
  className,
}: {
  bloco: Extract<Bloco, { tipo: 'confirmacao' }>;
  className?: string;
}) {
  const { emDesenvolvimento } = useAcoesAssistente();
  const [cancelada, setCancelada] = useState(false);
  return (
    <section className={cn('overflow-hidden rounded-card border border-line bg-panel', className)}>
      <header className="flex flex-wrap items-start gap-3 px-4 pt-4 pb-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-control bg-chat text-ink-2">
          <ArrowRightLeft className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h3 className="min-w-[14rem] flex-1 pt-1.5 font-sans text-[15px] leading-[22px] font-bold text-ink">
          {bloco.pergunta}
        </h3>
        <DemoBadge className="mt-1" />
      </header>
      <ul className="mx-4 divide-y divide-line-subtle rounded-control border border-line-subtle">
        {bloco.itens.map((it) => (
          <li
            key={it.nome}
            className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-[13px] leading-[18px]"
          >
            <span className="min-w-[9rem] font-semibold text-ink">{it.nome}</span>
            <span className="flex-1 font-medium text-ink-3">{it.interesse}</span>
            <span className="tabular inline-flex items-center gap-1.5 font-semibold text-emg-fg">
              <ClockAlert className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {it.venceu}
            </span>
          </li>
        ))}
      </ul>
      <footer className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-4">
        {cancelada ? (
          <p
            role="status"
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-2"
          >
            <X className="size-4 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
            Ação cancelada. Nenhuma oportunidade foi movida.
          </p>
        ) : (
          <>
            <Button
              size="lg"
              className="px-4"
              onClick={() => emDesenvolvimento(bloco.recurso, bloco.detalhe)}
            >
              Confirmar
            </Button>
            <Button size="lg" variant="outline" className="px-4" onClick={() => setCancelada(true)}>
              Cancelar
            </Button>
            <span className="text-xs font-medium text-ink-3">
              Nada muda no funil até você confirmar.
            </span>
          </>
        )}
      </footer>
    </section>
  );
}

// ─── Ações e sugestões ──────────────────────────────────────────────────────

function Acoes({
  bloco,
  className,
}: {
  bloco: Extract<Bloco, { tipo: 'acoes' }>;
  className?: string;
}) {
  const { emDesenvolvimento } = useAcoesAssistente();
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {bloco.itens.map((acao, i) => {
        const Icone = acao.icone;
        const variante = i === 0 ? 'default' : 'outline';
        const conteudo = (
          <>
            <Icone strokeWidth={1.75} aria-hidden="true" />
            {acao.rotulo}
          </>
        );
        return 'href' in acao ? (
          <Button key={acao.rotulo} asChild size="lg" variant={variante} className="px-3.5">
            <Link href={acao.href}>{conteudo}</Link>
          </Button>
        ) : (
          <Button
            key={acao.rotulo}
            size="lg"
            variant={variante}
            className="px-3.5"
            onClick={() => emDesenvolvimento(acao.recurso, acao.detalhe)}
          >
            {conteudo}
          </Button>
        );
      })}
    </div>
  );
}

function Sugestoes({
  bloco,
  className,
}: {
  bloco: Extract<Bloco, { tipo: 'sugestoes' }>;
  className?: string;
}) {
  const { enviar, ocupado } = useAcoesAssistente();
  return (
    <div className={className}>
      <h3 className="mb-2 font-sans text-sm leading-5 font-bold text-ink">{bloco.titulo}</h3>
      <div className="flex flex-wrap gap-2">
        {bloco.itens.map((texto) => (
          <button
            key={texto}
            type="button"
            disabled={ocupado}
            onClick={() => enviar(texto)}
            className="inline-flex min-h-8 items-center rounded-chip border border-ia-border bg-ia-bg/60 px-3 py-1 text-left text-[13px] leading-[18px] font-semibold text-ia-fg transition-colors duration-[120ms] outline-none hover:bg-ia-bg focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            {texto}
          </button>
        ))}
      </div>
    </div>
  );
}
