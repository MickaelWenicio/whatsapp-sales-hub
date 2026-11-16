'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCheck, FileText, Flag, ShieldCheck, UsersRound, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MODELOS_PADRAO, PassoMensagem, type Variacao } from './Modelos';
import { Simulacao } from './Simulacao';
import { DemoNotice, Page, Panel, Pill } from '../prototipo/comum';

const passos = ['Objetivo', 'Público', 'Mensagem', 'Revisão', 'Simulação', 'Resultado'];
export function RecuperacaoPage() {
  const [passo, setPasso] = useState(0);
  const [objetivo, setObjetivo] = useState('Retomar propostas sem retorno');
  const [dias, setDias] = useState('15');
  const [modelos, setModelos] = useState<string[]>(MODELOS_PADRAO);
  const [variacoes, setVariacoes] = useState<Variacao[]>([]);
  const pool = variacoes.length > 0 ? variacoes.map((v) => v.texto) : modelos.filter((m) => m.trim());
  const [concluida, setConcluida] = useState(false);
  return (
    <Page
      title="Boas conversas merecem continuar"
      description="Retome oportunidades com contexto, critérios claros e respeito a cada contato."
      action={
        <Pill tone="purple">
          <Workflow className="size-3.5" />
          Assistente de recuperação
        </Pill>
      }
    >
      <DemoNotice>
        Este assistente simula uma campanha. Nenhum contato recebe mensagens e nenhum envio é
        agendado.
      </DemoNotice>
      <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Panel>
          <ol className="space-y-1 p-3">
            {passos.map((p, i) => (
              <li key={p}>
                <button
                  className={cn(
                    'flex w-full items-center gap-3 rounded-control px-3 py-3 text-left text-sm',
                    passo === i ? 'bg-ia-bg font-bold text-ia-fg' : 'text-ink-3',
                  )}
                  onClick={() => { if (i < passo) { setConcluida(false); setPasso(i); } }}
                  disabled={i > passo}
                >
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                      i < passo
                        ? 'border-hum-border bg-hum-bg text-hum-fg'
                        : passo === i
                          ? 'border-ia-border'
                          : 'border-line',
                    )}
                  >
                    {i < passo ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  {p}
                </button>
              </li>
            ))}
          </ol>
          <div className="m-4 mt-1 border-t border-line-subtle pt-4 text-xs text-ink-3">
            Contatos restritos e conversas em atendimento humano são excluídos da prévia.
          </div>
        </Panel>
        <Panel
          title={
            [
              'O que você quer recuperar?',
              'Quem entra nesta recuperação?',
              'Modelos de mensagem',
              'Tudo pronto para a prévia',
              'Simulação do envio',
              'O resultado da sua simulação',
            ][passo]
          }
          subtitle={`Etapa ${passo + 1} de 6`}
        >
          <div className="min-h-[300px] p-5 md:p-6">
            {passo === 0 && (
              <div className="space-y-3">
                {[
                  'Retomar propostas sem retorno',
                  'Reativar leads antigos',
                  'Acompanhar intenção de contratação',
                ].map((o, i) => (
                  <button
                    key={o}
                    onClick={() => {
                      setObjetivo(o);
                      setConcluida(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-4 rounded-card border p-4 text-left',
                      objetivo === o ? 'border-sinal bg-ia-bg' : 'border-line hover:bg-canvas',
                    )}
                  >
                    <span className="flex size-10 items-center justify-center rounded-card bg-chat text-noite">
                      {i === 0 ? (
                        <FileText className="size-5" />
                      ) : i === 1 ? (
                        <UsersRound className="size-5" />
                      ) : (
                        <Flag className="size-5" />
                      )}
                    </span>
                    <span className="flex-1">
                      <span className="block font-bold">{o}</span>
                      <span className="mt-1 block text-xs text-ink-3">
                        {
                          [
                            'Uma nova oportunidade para tirar dúvidas e seguir adiante.',
                            'Volte a conversar com quem demonstrou interesse.',
                            'Ajude quem já está perto de decidir.',
                          ][i]
                        }
                      </span>
                    </span>
                    <span
                      className={cn(
                        'flex size-5 items-center justify-center rounded-full border',
                        objetivo === o ? 'border-sinal bg-sinal text-white' : 'border-line-control',
                      )}
                    >
                      {objetivo === o && <Check className="size-3" />}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {passo === 1 && (
              <div className="space-y-5">
                <div className="max-w-xs space-y-2 text-sm font-semibold">
                  <span id="dias-rotulo">Sem interação há pelo menos</span>
                  <Select value={dias} onValueChange={(v) => { setDias(v); setConcluida(false); }}>
                    <SelectTrigger aria-labelledby="dias-rotulo" className="h-10 w-full cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["7", "15", "30", "60"].map((v) => (
                        <SelectItem key={v} value={v} className="cursor-pointer">{v} dias</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ['42', 'Contatos encontrados'],
                    ['8', 'Excluídos pelas regras'],
                    ['34', 'Elegíveis na simulação'],
                  ].map(([n, t]) => (
                    <div key={t} className="rounded-card border border-line p-4">
                      <div className="font-display text-2xl font-semibold">{n}</div>
                      <div className="mt-1 text-xs text-ink-3">{t}</div>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-ink-2">
                  A prévia exclui contatos restritos, clientes com atendimento humano e
                  oportunidades já encerradas.
                </p>
              </div>
            )}
            {passo === 2 && (
              <PassoMensagem
                modelos={modelos}
                setModelos={(m) => { setModelos(m); setConcluida(false); }}
                variacoes={variacoes}
                setVariacoes={(v) => { setVariacoes(v); setConcluida(false); }}
              />
            )}
            {passo === 3 && (
              <div className="space-y-5">
                <div className="rounded-card bg-canvas p-4">
                  <div className="mb-3 text-xs font-semibold text-ink-3">Resumo da recuperação</div>
                  {[
                    ['Objetivo', objetivo],
                    ['Público', `34 contatos sem interação há ${dias} dias`],
                    ['Mensagens', `${modelos.length} modelo(s) e ${variacoes.length} variação(ões) geradas pela IA`],
                    ['Horário demonstrativo', 'Dias úteis, das 9h às 18h'],
                    ['Regra de parada', 'Interromper ao responder ou pedir para não receber'],
                  ].map(([k, v]) => (
                    <div
                      className="flex justify-between gap-4 border-b border-line-subtle py-3 last:border-0"
                      key={k}
                    >
                      <span className="text-ink-3">{k}</span>
                      <span className="max-w-[65%] text-right font-medium">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-sm text-hum-fg">
                  <ShieldCheck className="size-4" />
                  Esta etapa apenas revisa a simulação.
                </div>
              </div>
            )}
            {passo === 4 && (
              <Simulacao pool={pool} total={34} onFim={() => setConcluida(true)} />
            )}
            {passo === 5 && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-12 items-center justify-center rounded-full bg-hum-bg text-hum-fg">
                    <CheckCheck />
                  </span>
                  <div>
                    <h4 className="font-display text-lg font-semibold">Prévia concluída</h4>
                    <p className="text-sm text-ink-3">Nenhuma mensagem foi enviada ao WhatsApp.</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    ['34', 'Contatos elegíveis'],
                    ['3', 'Exemplos simulados'],
                    ['0', 'Envios reais'],
                  ].map(([n, t]) => (
                    <div className="rounded-card border border-line p-4" key={t}>
                      <div className="font-display text-3xl font-semibold">{n}</div>
                      <p className="mt-1 text-xs text-ink-3">{t}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-ink-2">
                  Na implantação completa, respostas e resultados serão acompanhados em tempo real e
                  vinculados ao funil.
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-line-subtle px-5 py-4">
            <Button variant="ghost" onClick={() => { setConcluida(false); setPasso((p) => p - 1); }} disabled={passo === 0}>
              <ArrowLeft />
              Voltar
            </Button>
            {passo < 5 ? (
              <Button
                onClick={() => setPasso((p) => p + 1)}
                disabled={(passo === 2 && !modelos.every((m) => m.trim().length >= 10)) || (passo === 4 && !concluida)}
              >
                Continuar
                <ArrowRight />
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setPasso(0);
                  setConcluida(false);
                }}
              >
                Nova simulação
              </Button>
            )}
          </div>
        </Panel>
      </div>
    </Page>
  );
}

