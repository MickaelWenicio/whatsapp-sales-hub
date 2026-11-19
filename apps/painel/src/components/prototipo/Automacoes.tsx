'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, Play, Plus, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { DemoNotice, Page, Panel, Pill } from './comum';

const ETAPAS = ['Novo contato', 'Qualificação', 'Proposta enviada', 'Negociação', 'Contratação'];
const GATILHOS = [
  { id: 'sem_resposta', rotulo: 'Lead sem resposta há X horas', unidade: 'horas', padrao: 4 },
  { id: 'etapa', rotulo: 'Oportunidade entrou na etapa X', unidade: '', padrao: 0 },
  { id: 'proposta', rotulo: 'Proposta enviada há X dias', unidade: 'dias', padrao: 2 },
] as const;
const CONDICOES = [
  'Sempre',
  'Somente em horário de atendimento',
  'Somente se o contato não pediu para parar',
  'Somente se a IA estiver ativa na conversa',
];
const ACOES = [
  { id: 'mensagem', rotulo: 'Enviar mensagem de acompanhamento' },
  { id: 'tarefa', rotulo: 'Criar tarefa para o responsável' },
  { id: 'mover', rotulo: 'Mover para a etapa X' },
] as const;

type Automacao = {
  id: string;
  nome: string;
  gatilho: string;
  valor: number;
  etapaGatilho: string;
  condicao: string;
  acao: string;
  etapaAcao: string;
  ativa: boolean;
  modelo?: boolean;
};

const CHAVE = 'saleshub-automacoes-prototipo';

const modelos: Automacao[] = [
  {
    id: 'm1',
    nome: 'Proposta sem retorno',
    gatilho: 'proposta',
    valor: 2,
    etapaGatilho: 'Proposta enviada',
    condicao: CONDICOES[2]!,
    acao: 'mensagem',
    etapaAcao: 'Negociação',
    ativa: true,
    modelo: true,
  },
  {
    id: 'm2',
    nome: 'Qualificação concluída',
    gatilho: 'etapa',
    valor: 0,
    etapaGatilho: 'Qualificação',
    condicao: CONDICOES[0]!,
    acao: 'tarefa',
    etapaAcao: 'Proposta enviada',
    ativa: true,
    modelo: true,
  },
  {
    id: 'm3',
    nome: 'Lead parado',
    gatilho: 'sem_resposta',
    valor: 4,
    etapaGatilho: 'Novo contato',
    condicao: CONDICOES[1]!,
    acao: 'mensagem',
    etapaAcao: 'Qualificação',
    ativa: true,
    modelo: true,
  },
];

function textoGatilho(a: Pick<Automacao, 'gatilho' | 'valor' | 'etapaGatilho'>): string {
  if (a.gatilho === 'sem_resposta') return `Lead sem resposta há ${a.valor} horas`;
  if (a.gatilho === 'proposta') return `Proposta enviada há ${a.valor} dias`;
  return `Oportunidade entrou na etapa ${a.etapaGatilho}`;
}
function textoAcao(a: Pick<Automacao, 'acao' | 'etapaAcao'>): string {
  if (a.acao === 'mensagem') return 'Enviar mensagem de acompanhamento';
  if (a.acao === 'tarefa') return 'Criar tarefa para o responsável';
  return `Mover para a etapa ${a.etapaAcao}`;
}

function passosSimulacao(a: Automacao): string[] {
  const espera =
    a.gatilho === 'sem_resposta'
      ? `Aguardando ${a.valor} horas sem resposta`
      : a.gatilho === 'proposta'
        ? `Aguardando ${a.valor} dias após o envio`
        : 'Evento recebido no mesmo instante';
  const entrada =
    a.gatilho === 'etapa'
      ? `Lead Ana entrou na etapa ${a.etapaGatilho}`
      : a.gatilho === 'proposta'
        ? 'Lead Ana recebeu a proposta PRO-1024'
        : 'Lead Ana enviou a última mensagem e não houve retorno';
  const fim =
    a.acao === 'mensagem'
      ? [
          'A IA gera a mensagem de acompanhamento com o contexto da conversa',
          'A mensagem entraria na fila de envio (não enviada no protótipo)',
        ]
      : a.acao === 'tarefa'
        ? ['Tarefa criada para o responsável: retomar contato com a Ana', 'Responsável avisado no painel']
        : [`Oportunidade da Ana movida para a etapa ${a.etapaAcao}`, 'Movimento registrado na trilha da conversa'];
  return [
    entrada,
    espera,
    `Condição verificada: ${a.condicao.toLowerCase()}`,
    ...fim,
    'Ação registrada na trilha de auditoria',
  ];
}

function SeletorSimples({
  valor,
  onChange,
  opcoes,
  rotulo,
}: {
  valor: string;
  onChange: (v: string) => void;
  opcoes: { v: string; t: string }[];
  rotulo: string;
}) {
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger aria-label={rotulo} className="h-10 w-full cursor-pointer">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opcoes.map((o) => (
          <SelectItem key={o.v} value={o.v} className="cursor-pointer">
            {o.t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AutomacoesPage() {
  const [criadas, setCriadas] = useState<Automacao[]>([]);
  const [estadoModelos, setEstadoModelos] = useState<Record<string, boolean>>({});
  const [novaAberta, setNovaAberta] = useState(false);
  const [passo, setPasso] = useState(1);
  const [form, setForm] = useState<Automacao>(vazia());
  const [simulando, setSimulando] = useState<Automacao | null>(null);
  const [visiveis, setVisiveis] = useState(0);
  const [paraRemover, setParaRemover] = useState<Automacao | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const salvo: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? 'null');
      if (Array.isArray(salvo)) setCriadas(salvo as Automacao[]);
    } catch {
      /* sem automações salvas */
    }
  }, []);
  function persistir(lista: Automacao[]) {
    setCriadas(lista);
    try {
      localStorage.setItem(CHAVE, JSON.stringify(lista));
    } catch {
      /* armazenamento indisponível */
    }
  }

  const todas = [...criadas, ...modelos.map((m) => ({ ...m, ativa: estadoModelos[m.id] ?? m.ativa }))];

  function vazia(): Automacao {
    return {
      id: '',
      nome: '',
      gatilho: 'proposta',
      valor: 2,
      etapaGatilho: ETAPAS[1]!,
      condicao: CONDICOES[0]!,
      acao: 'mensagem',
      etapaAcao: ETAPAS[3]!,
      ativa: true,
    };
  }
  function abrirNova() {
    setForm(vazia());
    setPasso(1);
    setNovaAberta(true);
  }
  function salvar() {
    const nome = form.nome.trim() || textoGatilho(form);
    persistir([{ ...form, id: `u${Date.now()}`, nome }, ...criadas]);
    setNovaAberta(false);
    toast.success('Automação simulada adicionada à lista.');
  }
  function alternar(a: Automacao, v: boolean) {
    if (a.modelo) setEstadoModelos((s) => ({ ...s, [a.id]: v }));
    else persistir(criadas.map((c) => (c.id === a.id ? { ...c, ativa: v } : c)));
    toast.success(`Automação ${v ? 'ativada' : 'pausada'} na simulação.`);
  }
  function simular(a: Automacao) {
    if (timer.current) clearInterval(timer.current);
    setSimulando(a);
    setVisiveis(0);
    const total = passosSimulacao(a).length;
    let n = 0;
    timer.current = setInterval(() => {
      n += 1;
      setVisiveis(n);
      if (n >= total && timer.current) clearInterval(timer.current);
    }, 900);
  }
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  const g = GATILHOS.find((x) => x.id === form.gatilho)!;
  const passos = simulando ? passosSimulacao(simulando) : [];

  return (
    <Page
      title="A operação segue o seu combinado"
      description="Regras simples conectam o atendimento ao próximo passo da equipe."
      demo={false}
      action={
        <div className="flex items-center gap-3">
          <Pill tone="purple">Simulação do protótipo</Pill>
          <Button className="h-9 cursor-pointer" onClick={abrirNova}>
            <Plus />
            Nova automação
          </Button>
        </div>
      }
    >
      <DemoNotice>
        As automações não executam nada de verdade. Crie uma regra e use Simular para ver como ela
        funcionaria com um lead de exemplo.
      </DemoNotice>
      <div className="grid gap-4 xl:grid-cols-2">
        {todas.map((a) => (
          <Panel key={a.id}>
            <div className="p-5">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-card bg-chat text-noite">
                  <Zap className="size-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold">{a.nome}</h3>
                  <div className="mt-1 text-xs text-ink-3">
                    {a.modelo ? 'Modelo de exemplo' : 'Criada por você'}
                  </div>
                </div>
                <Switch
                  className="cursor-pointer"
                  aria-label={`Ativar automação ${a.nome}`}
                  checked={a.ativa}
                  onCheckedChange={(v) => alternar(a, v)}
                />
              </div>
              <div className="space-y-4 border-l-2 border-line-subtle pl-4">
                <div>
                  <span className="text-xs font-bold text-ink-3">Gatilho</span>
                  <p className="mt-1 text-sm">{textoGatilho(a)}</p>
                </div>
                <div>
                  <span className="text-xs font-bold text-ink-3">Condição</span>
                  <p className="mt-1 text-sm">{a.condicao}</p>
                </div>
                <div>
                  <span className="text-xs font-bold text-ink-3">Ação</span>
                  <p className="mt-1 text-sm">{textoAcao(a)}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-line-subtle px-5 py-3">
              <Pill tone={a.ativa ? 'green' : 'neutral'}>{a.ativa ? 'Ativa' : 'Pausada'}</Pill>
              <div className="flex gap-1">
                {!a.modelo && (
                  <Button variant="ghost" className="cursor-pointer" onClick={() => setParaRemover(a)}>
                    <Trash2 />
                    Remover
                  </Button>
                )}
                <Button variant="ghost" className="cursor-pointer" onClick={() => simular(a)}>
                  <Play />
                  Simular
                </Button>
              </div>
            </div>
          </Panel>
        ))}
      </div>
      <Panel title="A pessoa continua no controle">
        <div className="grid gap-5 p-5 md:grid-cols-3">
          {[
            ['Intervenção humana', 'Assumir o atendimento interrompe a condução automática.'],
            ['Evidência de venda', 'Uma venda só é confirmada por uma pessoa, com evidência.'],
            ['Respeito ao contato', 'Um pedido de interrupção deve parar os acompanhamentos.'],
          ].map(([t, d]) => (
            <div key={t}>
              <ShieldCheck className="mb-2 size-5 text-ink-3" />
              <h4 className="font-bold">{t}</h4>
              <p className="mt-1 text-sm text-ink-2">{d}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Dialog open={novaAberta} onOpenChange={setNovaAberta}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova automação</DialogTitle>
            <DialogDescription>Passo {passo} de 3. Simulação, nada será executado.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            {['Gatilho', 'Condição', 'Ação'].map((t, i) => (
              <div
                key={t}
                className={cn(
                  'flex-1 border-b-2 pb-2 text-center text-xs font-semibold',
                  passo === i + 1 ? 'border-sinal text-sinal-forte' : 'border-line text-ink-3',
                )}
              >
                {t}
              </div>
            ))}
          </div>
          <div className="space-y-4 py-2">
            {passo === 1 && (
              <>
                <label className="block space-y-2 text-sm font-semibold">
                  <span>Quando acontecer</span>
                  <SeletorSimples
                    rotulo="Gatilho"
                    valor={form.gatilho}
                    onChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        gatilho: v,
                        valor: GATILHOS.find((x) => x.id === v)!.padrao,
                      }))
                    }
                    opcoes={GATILHOS.map((x) => ({ v: x.id, t: x.rotulo }))}
                  />
                </label>
                {g.id === 'etapa' ? (
                  <label className="block space-y-2 text-sm font-semibold">
                    <span>Etapa</span>
                    <SeletorSimples
                      rotulo="Etapa do gatilho"
                      valor={form.etapaGatilho}
                      onChange={(v) => setForm((f) => ({ ...f, etapaGatilho: v }))}
                      opcoes={ETAPAS.map((e) => ({ v: e, t: e }))}
                    />
                  </label>
                ) : (
                  <label className="block space-y-2 text-sm font-semibold">
                    <span>Quantidade de {g.unidade}</span>
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      className="h-10 w-32"
                      value={form.valor}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, valor: Math.max(1, Number(e.target.value) || 1) }))
                      }
                    />
                  </label>
                )}
              </>
            )}
            {passo === 2 && (
              <label className="block space-y-2 text-sm font-semibold">
                <span>Só continuar se</span>
                <SeletorSimples
                  rotulo="Condição"
                  valor={form.condicao}
                  onChange={(v) => setForm((f) => ({ ...f, condicao: v }))}
                  opcoes={CONDICOES.map((c) => ({ v: c, t: c }))}
                />
              </label>
            )}
            {passo === 3 && (
              <>
                <label className="block space-y-2 text-sm font-semibold">
                  <span>Então fazer</span>
                  <SeletorSimples
                    rotulo="Ação"
                    valor={form.acao}
                    onChange={(v) => setForm((f) => ({ ...f, acao: v }))}
                    opcoes={ACOES.map((x) => ({ v: x.id, t: x.rotulo }))}
                  />
                </label>
                {form.acao === 'mover' && (
                  <label className="block space-y-2 text-sm font-semibold">
                    <span>Etapa de destino</span>
                    <SeletorSimples
                      rotulo="Etapa de destino"
                      valor={form.etapaAcao}
                      onChange={(v) => setForm((f) => ({ ...f, etapaAcao: v }))}
                      opcoes={ETAPAS.map((e) => ({ v: e, t: e }))}
                    />
                  </label>
                )}
                <label className="block space-y-2 text-sm font-semibold">
                  <span>Nome da automação (opcional)</span>
                  <Input
                    className="h-10"
                    maxLength={80}
                    value={form.nome}
                    placeholder={textoGatilho(form)}
                    onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  />
                </label>
              </>
            )}
          </div>
          <DialogFooter>
            {passo > 1 && (
              <Button variant="outline" className="cursor-pointer" onClick={() => setPasso(passo - 1)}>
                Voltar
              </Button>
            )}
            {passo < 3 ? (
              <Button className="cursor-pointer" onClick={() => setPasso(passo + 1)}>
                Continuar
              </Button>
            ) : (
              <Button className="cursor-pointer" onClick={salvar}>
                Salvar automação
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!simulando} onOpenChange={(v) => !v && setSimulando(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Simulando: {simulando?.nome}</DialogTitle>
            <DialogDescription>
              <Pill tone="purple">Simulação do protótipo</Pill> Exemplo com a lead Ana. Nenhuma
              mensagem é enviada.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-2 py-2">
            {passos.map((s, i) => {
              const feito = i < visiveis;
              return (
                <li
                  key={s}
                  className={cn(
                    'flex items-center gap-3 rounded-control border p-3 text-sm transition-all duration-500',
                    feito ? 'border-hum-border bg-hum-bg opacity-100' : 'border-line opacity-40',
                  )}
                >
                  {feito ? (
                    <CheckCircle2 className="size-5 shrink-0 text-hum-fg" />
                  ) : (
                    <Circle className="size-5 shrink-0 text-ink-3" />
                  )}
                  <span>{s}</span>
                </li>
              );
            })}
          </ol>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => simulando && simular(simulando)}>
              Repetir
            </Button>
            <Button className="cursor-pointer" onClick={() => setSimulando(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!paraRemover} onOpenChange={(v) => !v && setParaRemover(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover automação?</DialogTitle>
            <DialogDescription>{paraRemover?.nome}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => setParaRemover(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="cursor-pointer"
              onClick={() => {
                if (paraRemover) persistir(criadas.filter((c) => c.id !== paraRemover.id));
                setParaRemover(null);
                toast.success('Automação removida.');
              }}
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}


