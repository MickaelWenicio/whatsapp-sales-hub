'use client';

import { useState } from 'react';
import { ChevronDown, Ellipsis, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useIaGlobal } from '@/lib/queries';
import { formatarDataRelativa } from '@/lib/formatos';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { CartaoAgente } from './CartaoAgente';
import { useNumeroOperacao } from './comum';
import { NovoAgente } from './NovoAgente';
import {
  FUNCOES,
  exibirCelular,
  novoId,
  rascunhoVazio,
  rotulo,
  type AgenteSimulado,
  type RascunhoAgente,
} from './tipos';

const DESCRICAO_REAL =
  'Atende os leads que chegam pelo WhatsApp, entende a necessidade de cada um, apresenta os planos aprovados e passa para a equipe de vendas quando o cliente está pronto.';

function paraRascunho(a: AgenteSimulado): RascunhoAgente {
  const base = rascunhoVazio();
  const r: Record<string, unknown> = {};
  for (const k of Object.keys(base) as (keyof RascunhoAgente)[]) r[k] = a[k];
  return r as RascunhoAgente;
}

type Assistente = { chave: number; aberto: boolean; edicao: AgenteSimulado | null };

/**
 * "Seus agentes": o agente comercial real (configurado logo abaixo, na mesma página) e os
 * agentes criados no protótipo, que ficam só no estado da tela, em modo simulação.
 */
export function ListaAgentes({ onAbrirAgenteReal }: { onAbrirAgenteReal: () => void }) {
  const [agentes, setAgentes] = useState<AgenteSimulado[]>([]);
  const [assistente, setAssistente] = useState<Assistente>({ chave: 0, aberto: false, edicao: null });
  const [paraExcluir, setParaExcluir] = useState<AgenteSimulado | null>(null);
  const operacao = useNumeroOperacao();
  const iaGlobal = useIaGlobal();

  // Só no estado da tela: os agentes criados somem ao recarregar.
  const persistir = setAgentes;

  const abrir = (edicao: AgenteSimulado | null) =>
    setAssistente((a) => ({ chave: a.chave + 1, aberto: true, edicao }));
  const fecharAssistente = () => setAssistente((a) => ({ ...a, aberto: false }));

  function salvar(r: RascunhoAgente) {
    const edicao = assistente.edicao;
    if (edicao) {
      persistir(agentes.map((x) => (x.id === edicao.id ? { ...x, ...r } : x)));
      toast.success('Alterações salvas.');
    } else {
      persistir([...agentes, { ...r, id: novoId(), status: 'simulacao', criadoEm: new Date().toISOString() }]);
      toast.success('Agente criado em modo simulação.');
    }
    fecharAssistente();
  }

  function alternarPausa(a: AgenteSimulado) {
    const pausar = a.status !== 'pausado';
    persistir(agentes.map((x) => (x.id === a.id ? { ...x, status: pausar ? 'pausado' : 'simulacao' } : x)));
    toast.success(pausar ? 'Agente pausado.' : 'Agente retomado em modo simulação.');
  }

  function excluir(a: AgenteSimulado) {
    persistir(agentes.filter((x) => x.id !== a.id));
    setParaExcluir(null);
    toast.success('Agente excluído.');
  }

  const numeroDo = (a: AgenteSimulado) =>
    a.origemNumero === 'operacao' ? operacao.numero : exibirCelular(a.numeroNovo) || null;

  return (
    <section aria-labelledby="seus-agentes-titulo" className="rounded-panel border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-subtle px-5 py-4">
        <div className="min-w-0">
          <h3 id="seus-agentes-titulo" className="font-display text-[17px] leading-6 font-semibold text-ink">
            Seus agentes
          </h3>
          <p className="mt-1 text-xs text-ink-3">
            Cada agente atende por um número de WhatsApp, com a própria descrição, voz e regras.
          </p>
        </div>
        <Button className="h-9 cursor-pointer px-3" onClick={() => abrir(null)}>
          <Plus />
          Novo agente
        </Button>
      </div>

      <div className="grid gap-4 p-5 md:grid-cols-2 2xl:grid-cols-3">
        <CartaoAgente
          nome="Agente comercial"
          funcao="Vendas e qualificação"
          descricao={DESCRICAO_REAL}
          cor="noite"
          numero={operacao.numero}
          status={iaGlobal.data?.ativa === false ? 'pausado' : 'ativo'}
          capacidades={{ texto: true, audio: false, ligacoes: false, voz: false }}
          onAbrir={onAbrirAgenteReal}
          rotuloAbrir="Agente comercial: ver a configuração"
          rodape={
            <span className="inline-flex items-center gap-1 font-semibold text-sinal-forte">
              <ChevronDown className="size-3.5" aria-hidden />
              Configuração logo abaixo
            </span>
          }
        />

        {agentes.map((a) => (
          <CartaoAgente
            key={a.id}
            nome={a.nome}
            funcao={rotulo(FUNCOES, a.funcao) || 'Personalizada'}
            descricao={a.descricao}
            cor={a.cor}
            numero={numeroDo(a)}
            status={a.status}
            capacidades={{
              texto: true,
              audio: a.audio.ativo,
              ligacoes: a.ligacoes.ativo,
              voz: a.clonar.ativo && a.clonar.vozGerada,
            }}
            rodape={<span className="tabular">Criado {formatarDataRelativa(a.criadoEm)}</span>}
            menu={
              // modal={false}: os itens abrem diálogos, e o menu modal deixaria o body sem cliques
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="cursor-pointer text-ink-3 hover:text-ink data-[state=open]:bg-chat data-[state=open]:text-ink"
                    aria-label={`Ações de ${a.nome}`}
                  >
                    <Ellipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={() => abrir(a)}>
                    <Pencil />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => alternarPausa(a)}>
                    {a.status === 'pausado' ? <Play /> : <Pause />}
                    {a.status === 'pausado' ? 'Retomar' : 'Pausar'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setParaExcluir(a)}>
                    <Trash2 />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          />
        ))}

        {agentes.length === 0 && (
          <button
            type="button"
            onClick={() => abrir(null)}
            className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed border-line px-6 py-8 text-center transition-colors duration-[120ms] hover:border-line-control hover:bg-canvas focus-visible:ring-2 focus-visible:ring-sinal focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-chat text-ink-2">
              <Plus className="size-5" aria-hidden />
            </span>
            <span className="mt-3 text-sm font-bold text-ink">Criar outro agente</span>
            <span className="mt-1 max-w-[36ch] text-[13px] text-ink-3">
              Pós-venda, cobrança ou suporte ao cliente, com áudio, ligações e voz própria.
            </span>
          </button>
        )}
      </div>

      <NovoAgente
        key={assistente.chave}
        aberto={assistente.aberto}
        inicial={assistente.edicao ? paraRascunho(assistente.edicao) : rascunhoVazio()}
        editando={!!assistente.edicao}
        operacao={operacao}
        onFechar={fecharAssistente}
        onSalvar={salvar}
      />

      <AlertDialog open={!!paraExcluir} onOpenChange={(v) => !v && setParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-[17px] font-semibold text-ink">
              Excluir {paraExcluir?.nome}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-ink-2">
              O agente sai da lista. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 cursor-pointer">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="h-9 cursor-pointer"
              onClick={() => paraExcluir && excluir(paraExcluir)}
            >
              <Trash2 />
              Excluir agente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
