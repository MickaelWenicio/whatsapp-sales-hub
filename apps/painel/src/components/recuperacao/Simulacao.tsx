'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarClock, Pause, Play, RotateCcw, Send, ShieldCheck } from 'lucide-react';
import { iniciais } from '@/lib/formatos';
import { Button } from '@/components/ui/button';
import { EmDesenvolvimento } from '@/components/ui/em-desenvolvimento';
import { interesses, nomes, Pill } from '../prototipo/comum';
import { preencher } from './Modelos';

type Fase = 'fila' | 'gerando' | 'revalidando' | 'enviada';
const ROTULO: Record<Fase, string> = {
  fila: 'Na fila',
  gerando: 'Gerando variação',
  revalidando: 'Revalidando',
  enviada: 'Enviada (simulada)',
};
const TOM: Record<Fase, 'neutral' | 'blue' | 'amber' | 'green'> = {
  fila: 'neutral',
  gerando: 'blue',
  revalidando: 'amber',
  enviada: 'green',
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export function Simulacao({
  pool,
  total,
  onFim,
}: {
  pool: string[];
  total: number;
  onFim: () => void;
}) {
  const alvos = nomes.map((n, i) => ({ nome: n, interesse: interesses[i] ?? interesses[0]! }));
  const [fases, setFases] = useState<Fase[]>(() => alvos.map(() => 'fila'));
  const [textos, setTextos] = useState<(string | null)[]>(() => alvos.map(() => null));
  const [atual, setAtual] = useState(0);
  const [iniciada, setIniciada] = useState(false);
  const [pausada, setPausada] = useState(false);
  const duracao = useRef(1500);
  const fim = iniciada && atual >= alvos.length;

  const fase = fases[atual];
  useEffect(() => {
    if (!iniciada || pausada || atual >= alvos.length) return;
    const cur = atual;
    const trocar = (f: Fase) => setFases((p) => p.map((x, i) => (i === cur ? f : x)));
    let t: ReturnType<typeof setTimeout>;
    if (fases[cur] === 'fila') {
      // intervalo aleatório (compactado) entre um envio e o seguinte
      duracao.current = rand(1200, 3000);
      t = setTimeout(() => {
        const base = pool[cur % pool.length] ?? '';
        setTextos((p) => p.map((x, i) => (i === cur ? preencher(base, alvos[cur]!.nome.split(' ')[0]!, alvos[cur]!.interesse.produto) : x)));
        trocar('gerando');
      }, 300);
    } else if (fases[cur] === 'gerando') {
      t = setTimeout(() => trocar('revalidando'), duracao.current * 0.4);
    } else if (fases[cur] === 'revalidando') {
      t = setTimeout(() => trocar('enviada'), duracao.current * 0.4);
    } else {
      t = setTimeout(() => setAtual(cur + 1), duracao.current * 0.2);
    }
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iniciada, pausada, atual, fase]);

  useEffect(() => {
    if (fim) onFim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fim]);

  const enviadas = fases.filter((f) => f === 'enviada').length;
  const pct = Math.round((enviadas / alvos.length) * 100);

  function reiniciar() {
    setFases(alvos.map(() => 'fila'));
    setTextos(alvos.map(() => null));
    setAtual(0);
    setPausada(false);
    setIniciada(true);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-ia-border bg-ia-bg p-4 text-sm text-ia-fg">
        <p className="font-bold">Fila de envio da recuperação</p>
        <p className="mt-1">
          Na versão final, é aqui que o lote é enviado pelo WhatsApp. No protótipo, nada é enviado:
          você vê como o envio aconteceria.
        </p>
      </div>
      <p className="flex items-start gap-2 text-sm text-ink-2">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-hum-fg" />
        Intervalo aleatório entre envios e janela de horário comercial para proteger o número. Os
        contatos saem um de cada vez, nunca todos ao mesmo tempo. Aqui os intervalos de minutos são
        comprimidos para alguns segundos. A simulação mostra {alvos.length} dos {total} contatos
        elegíveis.
      </p>

      <div>
        <div className="mb-1 flex justify-between text-xs text-ink-3">
          <span>
            {enviadas} de {alvos.length} simuladas
          </span>
          <span>{pct}%</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-sunken"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-sinal transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!iniciada ? (
          <Button className="cursor-pointer" onClick={() => setIniciada(true)}>
            <Play />
            Iniciar simulação
          </Button>
        ) : fim ? (
          <Button variant="outline" className="cursor-pointer" onClick={reiniciar}>
            <RotateCcw />
            Simular de novo
          </Button>
        ) : pausada ? (
          <Button className="cursor-pointer" onClick={() => setPausada(false)}>
            <Play />
            Retomar
          </Button>
        ) : (
          <Button variant="outline" className="cursor-pointer" onClick={() => setPausada(true)}>
            <Pause />
            Pausar
          </Button>
        )}
        <EmDesenvolvimento
          recurso="Agendar envio"
          detalhe="O agendamento do lote para a janela de horário comercial faz parte da versão completa."
        >
          {(abrir) => (
            <Button variant="outline" className="cursor-pointer" onClick={abrir}>
              <CalendarClock />
              Agendar envio
            </Button>
          )}
        </EmDesenvolvimento>
        <EmDesenvolvimento
          recurso="Enviar pelo WhatsApp"
          detalhe="O envio real do lote pelo WhatsApp faz parte da versão completa. No protótipo, nenhuma mensagem é enviada."
        >
          {(abrir) => (
            <Button variant="outline" className="cursor-pointer" onClick={abrir}>
              <Send />
              Enviar de verdade
            </Button>
          )}
        </EmDesenvolvimento>
        {pausada && <Pill tone="amber">Pausada</Pill>}
      </div>

      <ul className="space-y-2">
        {alvos.map((a, i) => (
          <li key={a.nome} className="flex items-start gap-3 rounded-card border border-line p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sunken text-xs font-bold">
              {iniciais(a.nome)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-bold">{a.nome}</span>
                  <span className="ml-2 text-xs text-ink-3">
                    {a.interesse.produto}, {a.interesse.detalhe.toLocaleLowerCase('pt-BR')}
                  </span>
                </div>
                <Pill tone={TOM[fases[i]!]}>{ROTULO[fases[i]!]}</Pill>
              </div>
              {fases[i] === 'revalidando' && (
                <p className="mt-1 text-xs text-ink-3">
                  Conferindo se o lead não respondeu nem pediu para parar.
                </p>
              )}
              {textos[i] && (
                <p className="mt-2 rounded-lg bg-chat p-2 text-sm leading-6">{textos[i]}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {fim && (
        <div className="space-y-3 rounded-card border border-hum-border bg-hum-bg p-4 text-hum-fg">
          <p className="font-bold">
            Resumo: {alvos.length} mensagens simuladas, uma por vez, cada uma com uma variação.
          </p>
          <Pill tone="green">Simulação: nenhuma mensagem real foi enviada</Pill>
        </div>
      )}
    </div>
  );
}
