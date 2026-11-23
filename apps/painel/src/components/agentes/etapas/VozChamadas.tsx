'use client';

import type { ReactNode } from 'react';
import { AudioLines, Mic, PhoneCall, ShieldCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClonagemVoz } from '../ClonagemVoz';
import { CabecalhoEtapa, Campo } from '../comum';
import {
  DURACOES,
  QUANDO_AUDIO,
  VOZES_PADRAO,
  type DuracaoMax,
  type PropsEtapa,
  type QuandoAudio,
  type RascunhoAgente,
  type VozPadrao,
} from '../tipos';

/** Card de recurso: ícone, título, descrição e interruptor. Ligado, revela as opções. */
function OpcaoVoz({
  id,
  icone: I,
  titulo,
  descricao,
  selo,
  ativo,
  onAtivo,
  children,
}: {
  id: string;
  icone: LucideIcon;
  titulo: string;
  descricao: string;
  selo?: ReactNode;
  ativo: boolean;
  onAtivo: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`agente-${id}-titulo`}
      className={cn(
        'rounded-card border transition-colors duration-[160ms] ease-standard',
        ativo ? 'border-ia-border bg-ia-bg/35' : 'border-line bg-panel hover:border-line-control',
      )}
    >
      <div className="flex items-start gap-4 p-4">
        <span
          aria-hidden
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-card transition-colors duration-[160ms] ease-standard',
            ativo ? 'bg-sinal text-white' : 'bg-chat text-ink-2',
          )}
        >
          <I className="size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <label
              id={`agente-${id}-titulo`}
              htmlFor={`agente-${id}`}
              className="cursor-pointer text-[15px] leading-5 font-bold text-ink"
            >
              {titulo}
            </label>
            {selo}
          </div>
          <p id={`agente-${id}-desc`} className="mt-1 max-w-[56ch] text-sm leading-[22px] text-ink-2">
            {descricao}
          </p>
        </div>
        <Switch
          id={`agente-${id}`}
          checked={ativo}
          onCheckedChange={onAtivo}
          aria-describedby={`agente-${id}-desc`}
          className="mt-1 cursor-pointer"
        />
      </div>
      {ativo && <div className="border-t border-ia-border/70 px-4 pt-4 pb-5 sm:pl-[72px]">{children}</div>}
    </section>
  );
}

export function EtapaVozChamadas({
  r,
  alterar,
  erros,
  mostrarErros,
  reduzido,
}: PropsEtapa & { reduzido: boolean }) {
  const setAudio = (p: Partial<RascunhoAgente['audio']>) => alterar((x) => ({ audio: { ...x.audio, ...p } }));
  const setLigacoes = (p: Partial<RascunhoAgente['ligacoes']>) =>
    alterar((x) => ({ ligacoes: { ...x.ligacoes, ...p } }));
  const setClonar = (p: Partial<RascunhoAgente['clonar']>) => alterar((x) => ({ clonar: { ...x.clonar, ...p } }));

  return (
    <div>
      <CabecalhoEtapa
        titulo="Voz e chamadas"
        descricao="Além do texto, o agente pode falar com o cliente. Ligue só o que fizer sentido para a operação."
      />

      <div className="space-y-3">
        <OpcaoVoz
          id="audio"
          icone={AudioLines}
          titulo="Enviar áudios"
          descricao="O agente responde com mensagens de voz quando o cliente manda áudio ou prefere ouvir."
          ativo={r.audio.ativo}
          onAtivo={(v) => setAudio({ ativo: v })}
        >
          <Campo rotulo="Quando enviar áudio" htmlFor="agente-quando-audio" className="max-w-sm">
            <Select value={r.audio.quando} onValueChange={(v) => setAudio({ quando: v as QuandoAudio })}>
              <SelectTrigger id="agente-quando-audio" size="lg" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUANDO_AUDIO.map((q) => (
                  <SelectItem key={q.v} value={q.v}>
                    {q.t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        </OpcaoVoz>

        <OpcaoVoz
          id="ligacoes"
          icone={PhoneCall}
          titulo="Atender ligações"
          descricao="O agente atende ligações de voz pelo WhatsApp e transfere para uma pessoa quando precisar."
          ativo={r.ligacoes.ativo}
          onAtivo={(v) => setLigacoes({ ativo: v })}
        >
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <label htmlFor="agente-transferir-humano" className="cursor-pointer">
                <span className="block text-sm font-semibold text-ink">
                  Transferir para humano se o cliente pedir
                </span>
                <span className="mt-0.5 block text-[13px] text-ink-3">
                  A ligação passa para a equipe junto com o resumo da conversa.
                </span>
              </label>
              <Switch
                id="agente-transferir-humano"
                checked={r.ligacoes.transferirHumano}
                onCheckedChange={(v) => setLigacoes({ transferirHumano: v })}
                className="mt-1 cursor-pointer"
              />
            </div>
            <Campo
              rotulo="Duração máxima"
              htmlFor="agente-duracao"
              ajuda="Ao chegar no limite, o agente se despede e oferece continuar por mensagem."
            >
              <Select
                value={r.ligacoes.duracaoMax}
                onValueChange={(v) => setLigacoes({ duracaoMax: v as DuracaoMax })}
              >
                <SelectTrigger id="agente-duracao" size="lg" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURACOES.map((d) => (
                    <SelectItem key={d.v} value={d.v}>
                      {d.t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
          </div>
        </OpcaoVoz>

        <OpcaoVoz
          id="clonar"
          icone={Mic}
          titulo="Clonar voz"
          descricao="Use uma voz da sua equipe para o agente soar como alguém da empresa."
          selo={
            <span className="inline-flex items-center gap-1 rounded-chip border border-line bg-panel px-1.5 py-0.5 text-xs font-semibold text-ink-2">
              <ShieldCheck className="size-3.5" aria-hidden />
              Requer autorização
            </span>
          }
          ativo={r.clonar.ativo}
          onAtivo={(v) => setClonar({ ativo: v })}
        >
          <ClonagemVoz
            clonar={r.clonar}
            setClonar={setClonar}
            erros={erros}
            mostrarErros={mostrarErros}
            reduzido={reduzido}
          />
        </OpcaoVoz>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-canvas p-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="agente-voz-padrao" className="text-sm font-semibold text-ink">
            Voz padrão
          </label>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {r.clonar.ativo
              ? 'Com Clonar voz ligado, o agente usa a voz clonada nos áudios e nas ligações.'
              : 'Usada nos áudios e nas ligações enquanto a voz clonada estiver desligada.'}
          </p>
        </div>
        <Select
          value={r.vozPadrao}
          onValueChange={(v) => alterar({ vozPadrao: v as VozPadrao })}
          disabled={r.clonar.ativo}
        >
          <SelectTrigger id="agente-voz-padrao" size="lg" className="w-56 bg-panel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VOZES_PADRAO.map((v) => (
              <SelectItem key={v.v} value={v.v}>
                {v.t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
