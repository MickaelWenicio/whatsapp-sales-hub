'use client';

import type { ReactNode } from 'react';
import { Pencil } from 'lucide-react';
import { DemoNotice } from '@/components/prototipo/comum';
import { AvatarAgente, CabecalhoEtapa, ChipCapacidade } from '../comum';
import {
  FUNCOES,
  HORARIOS,
  OBJETIVOS,
  QUANDO_AUDIO,
  TONS,
  VOZES_PADRAO,
  exibirCelular,
  rotulo,
  type RascunhoAgente,
} from '../tipos';

function Resumo({
  titulo,
  onEditar,
  children,
}: {
  titulo: string;
  onEditar: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-4 py-3">
        <h4 className="text-sm font-bold text-ink">{titulo}</h4>
        <button
          type="button"
          onClick={onEditar}
          aria-label={`Editar ${titulo.toLowerCase()}`}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-control px-2 py-1 text-[13px] font-semibold text-sinal-forte transition-colors duration-[120ms] hover:bg-ia-bg focus-visible:ring-2 focus-visible:ring-sinal focus-visible:outline-none"
        >
          <Pencil className="size-3.5" aria-hidden />
          Editar
        </button>
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function Linhas({ itens }: { itens: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
      {itens.map(([t, v]) => (
        <div key={t} className="contents">
          <dt className="text-[13px] font-medium text-ink-3">{t}</dt>
          <dd className="text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EtapaRevisao({
  r,
  numeroOperacao,
  irPara,
}: {
  r: RascunhoAgente;
  numeroOperacao: string | null;
  irPara: (etapa: number) => void;
}) {
  const numero =
    r.origemNumero === 'operacao'
      ? `${numeroOperacao ?? 'Número da operação'} (número da operação)`
      : `${exibirCelular(r.numeroNovo)} (novo número, não conectado no protótipo)`;
  const vozClonada = r.clonar.ativo && r.clonar.vozGerada;

  return (
    <div>
      <CabecalhoEtapa
        titulo="Revisão"
        descricao="Confira tudo antes de criar. Você pode voltar a qualquer etapa pelo Editar."
      />

      <div className="space-y-3">
        <Resumo titulo="Identidade" onEditar={() => irPara(0)}>
          <div className="flex items-start gap-3">
            <AvatarAgente nome={r.nome} cor={r.cor} />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-ink">{r.nome.trim()}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-ink-3">
                <span>{rotulo(FUNCOES, r.funcao)}</span>
                <span>Tom {rotulo(TONS, r.tom).toLowerCase()}</span>
              </p>
              <p className="mt-2 max-w-[72ch] text-sm leading-[22px] break-words text-ink-2">{r.descricao.trim()}</p>
            </div>
          </div>
        </Resumo>

        <Resumo titulo="Canal" onEditar={() => irPara(1)}>
          <Linhas
            itens={[
              ['Número do WhatsApp', <span key="n" className="tabular">{numero}</span>],
              ['Horário', rotulo(HORARIOS, r.horario)],
            ]}
          />
        </Resumo>

        <Resumo titulo="Voz e chamadas" onEditar={() => irPara(2)}>
          <div className="mb-4 flex flex-wrap gap-1.5">
            <ChipCapacidade tipo="texto" ativo />
            <ChipCapacidade tipo="audio" ativo={r.audio.ativo} />
            <ChipCapacidade tipo="ligacoes" ativo={r.ligacoes.ativo} />
            <ChipCapacidade tipo="voz" ativo={vozClonada} />
          </div>
          <Linhas
            itens={[
              ['Áudios', r.audio.ativo ? `Ligado. ${rotulo(QUANDO_AUDIO, r.audio.quando)}.` : 'Desligado'],
              [
                'Ligações',
                r.ligacoes.ativo
                  ? `Ligado, até ${r.ligacoes.duracaoMax} min por ligação. ${
                      r.ligacoes.transferirHumano
                        ? 'Transfere para uma pessoa se o cliente pedir.'
                        : 'Não transfere a pedido do cliente.'
                    }`
                  : 'Desligado',
              ],
              [
                'Voz',
                vozClonada && r.clonar.amostra
                  ? `Voz clonada (simulação), a partir de ${r.clonar.amostra.nome}`
                  : `Voz padrão: ${rotulo(VOZES_PADRAO, r.vozPadrao).toLowerCase()}`,
              ],
            ]}
          />
        </Resumo>

        <Resumo titulo="Comportamento" onEditar={() => irPara(3)}>
          <Linhas
            itens={[
              ['Objetivo principal', rotulo(OBJETIVOS, r.objetivo)],
              [
                'Transferir quando',
                <ul key="t" className="space-y-1">
                  {r.regrasTransferencia.map((t, i) => (
                    <li key={`${t}-${i}`}>{t}</li>
                  ))}
                </ul>,
              ],
              [
                'Apresentação',
                r.apresentacao.trim() ? (
                  <span className="break-words">{r.apresentacao.trim()}</span>
                ) : (
                  <span className="text-ink-2">Em branco. O agente se apresenta de forma natural.</span>
                ),
              ],
            ]}
          />
        </Resumo>
      </div>

      <div className="mt-5">
        <DemoNotice>
          Agente criado em modo simulação: ele aparece na lista, mas não atende clientes no protótipo.
        </DemoNotice>
      </div>
    </div>
  );
}
