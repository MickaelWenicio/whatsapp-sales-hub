'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  Download,
  Upload,
  Plus,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ConversaItemDTO, ListaConversasDTO } from '@sales-hub/shared';
import { ehNumeroFicticio, ROTULOS_ETAPA } from '@sales-hub/shared';
import { bff } from '@/lib/bff';
import { iniciais } from '@/lib/formatos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmDesenvolvimento } from '@/components/ui/em-desenvolvimento';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { DemoNotice, interesses, Metric, nomes, Page, Panel, Pill } from './comum';

export function ContatosPage() {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('Todos');
  const [selecionado, setSelecionado] = useState<ConversaItemDTO | null>(null);
  const q = useQuery({
    queryKey: ['contatos-prototipo'],
    queryFn: () => bff.get<ListaConversasDTO>('conversas?limite=50'),
  });
  const contatos = [...new Map((q.data?.itens ?? []).map((c) => [c.contato.id, c])).values()];
  const lista = contatos.filter(
    (c) =>
      `${c.contato.nome} ${c.contato.telefoneExibicao}`
        .toLocaleLowerCase('pt-BR')
        .includes(busca.toLocaleLowerCase('pt-BR')) &&
      (filtro === 'Todos' || (filtro === 'Com intenção' ? c.intencao : c.estado === 'IA_ATIVA')),
  );
  function exportar() {
    const escape = (v: string) =>
      '"' + (/^[\s]*[=+@-]/.test(v) ? "'" : '') + v.replace(/"/g, '""') + '"';
    const csv =
      '\uFEFFNome;Telefone;Etapa\n' +
      lista
        .map((c) =>
          [c.contato.nome ?? '', c.contato.telefoneExibicao, c.etapa ? ROTULOS_ETAPA[c.etapa] : '']
            .map(escape)
            .join(';'),
        )
        .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contatos.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Lista de contatos exportada.');
  }
  return (
    <Page
      demo={contatos.length > 0 && contatos.every((c) => ehNumeroFicticio(c.contato.e164))}
      title="Relacionamentos que continuam"
      description="O contexto de cada pessoa, do primeiro contato ao pós-venda."
      action={
        <div className="flex gap-2">
          <EmDesenvolvimento recurso="Importar contatos">
            {(abrir) => (
              <Button variant="outline" className="h-9 cursor-pointer bg-panel" onClick={abrir}>
                <Upload />
                Importar
              </Button>
            )}
          </EmDesenvolvimento>
          <Button variant="outline" className="h-9 cursor-pointer bg-panel" onClick={exportar}>
            <Download />
            Exportar lista
          </Button>
        </div>
      }
    >
      <Panel>
        <div className="flex flex-wrap">
          <Metric
            label="Contatos nesta visualização"
            value={String(contatos.length)}
            detail="Até 50 conversas recentes"
          />
          <Metric
            label="Em atendimento pela IA"
            value={String(contatos.filter((c) => c.estado === 'IA_ATIVA').length)}
            detail="Condução demonstrativa"
          />
          <Metric
            label="Intenção de contratar"
            value={String(contatos.filter((c) => c.intencao).length)}
            detail="Próximo passo: contratação"
          />
        </div>
      </Panel>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle p-4">
          <div className="relative w-full max-w-sm">
            <Search className="absolute top-2.5 left-3 size-4 text-ink-3" />
            <Input
              aria-label="Buscar contatos"
              placeholder="Buscar por nome ou telefone"
              className="h-9 pl-9"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="flex gap-1">
            {['Todos', 'Com intenção', 'Com a IA'].map((f) => (
              <Button
                key={f}
                variant={f === filtro ? 'secondary' : 'ghost'}
                onClick={() => setFiltro(f)}
              >
                {f}
              </Button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-xs text-ink-3">
              <tr>
                {['Contato', 'Telefone', 'Etapa da negociação', 'Responsável', ''].map((v, i) => (
                  <th className="px-5 py-3 font-semibold" key={i}>
                    {v}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {lista.map((c) => (
                <tr key={c.id} className="hover:bg-canvas/70">
                  <td className="px-5 py-3">
                    <button
                      className="flex cursor-pointer items-center gap-3 text-left"
                      onClick={() => setSelecionado(c)}
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sunken text-xs font-bold">
                        {iniciais(c.contato.nome ?? 'Contato')}
                      </span>
                      <span>
                        <span className="block font-bold text-ink">
                          {c.contato.nome ?? 'Contato sem nome'}
                        </span>
                        <span className="text-xs text-ink-3">WhatsApp</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-5 py-3 tabular-nums text-ink-2">
                    {c.contato.telefoneExibicao}
                  </td>
                  <td className="px-5 py-3">
                    <Pill tone={c.intencao ? 'green' : 'blue'}>
                      {c.etapa ? ROTULOS_ETAPA[c.etapa] : 'Sem oportunidade'}
                    </Pill>
                  </td>
                  <td className="px-5 py-3 text-ink-2">
                    {c.responsavel?.nome ??
                      (c.estado === 'IA_ATIVA' ? 'Agente de IA' : 'Sem responsável')}
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      className="text-xs font-bold text-sinal-forte hover:underline"
                      href={`/atendimento?c=${c.id}`}
                    >
                      Abrir conversa
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {q.isLoading && <div className="p-12 text-center text-ink-3">Carregando contatos…</div>}
        {q.isError && (
          <div role="alert" className="p-8 text-center">
            <p className="text-ink-2">Não foi possível carregar os contatos.</p>
            <Button variant="outline" className="mt-3" onClick={() => void q.refetch()}>
              Tentar de novo
            </Button>
          </div>
        )}
        {!q.isLoading && !q.isError && !lista.length && (
          <div className="p-12 text-center text-ink-3">
            Nenhum contato encontrado para essa busca.
          </div>
        )}
        <div className="border-t border-line-subtle px-5 py-3 text-xs text-ink-3">
          {lista.length} contatos exibidos. Abra uma conversa para consultar os dados e o histórico
          completo.
        </div>
      </Panel>
      <Dialog open={!!selecionado} onOpenChange={(v) => !v && setSelecionado(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selecionado?.contato.nome ?? 'Contato'}</DialogTitle>
            <DialogDescription>
              O histórico acompanha o contato em cada atendimento.
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-4 py-3">
            <div>
              <dt className="text-xs text-ink-3">Telefone</dt>
              <dd className="mt-1 font-semibold">{selecionado?.contato.telefoneExibicao}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Responsável</dt>
              <dd className="mt-1">
                {selecionado?.responsavel?.nome ??
                  (selecionado?.estado === 'IA_ATIVA' ? 'Agente de IA' : 'Sem responsável')}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Etapa</dt>
              <dd className="mt-1">
                {selecionado?.etapa ? ROTULOS_ETAPA[selecionado.etapa] : 'Sem oportunidade'}
              </dd>
            </div>
          </dl>
          <DialogFooter>
            <Button asChild>
              <Link href={`/atendimento?c=${selecionado?.id}`}>Ver ficha e conversa</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

const EMPRESA_NOME = process.env.NEXT_PUBLIC_EMPRESA_NOME ?? 'Empresa Exemplo';
const PRODUTOS_PROPOSTA = ['Plano Essencial', 'Plano Completo', 'Soluções para Empresas'];

type Proposta = {
  id: string;
  nome: string;
  interesse: string;
  produto: string;
  status: string;
  data: string;
};
const propostasIniciais: Proposta[] = nomes.map((nome, i) => ({
  id: `PRO-${1024 + i}`,
  nome,
  interesse: interesses[i]!.detalhe,
  produto: interesses[i]!.produto,
  status: [
    'Aguardando retorno',
    'Em preparação',
    'Aceita',
    'Aguardando retorno',
    'Em preparação',
    'Expirada',
  ][i]!,
  data: '11 nov. 2026',
}));
export function PropostasPage() {
  const [propostas, setPropostas] = useState(propostasIniciais);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('Todas');
  const [nova, setNova] = useState(false);
  const [cliente, setCliente] = useState(nomes[0]);
  const [produto, setProduto] = useState(PRODUTOS_PROPOSTA[0]!);
  const [atual, setAtual] = useState<Proposta | null>(null);
  const lista = propostas.filter(
    (p) =>
      `${p.nome} ${p.id}`.toLowerCase().includes(busca.toLowerCase()) &&
      (filtro === 'Todas' || p.status === filtro),
  );
  return (
    <Page
      title="Cada proposta, um próximo passo"
      description="Prepare, acompanhe e retome as propostas no contexto da negociação."
      action={
        <Button className="h-9" onClick={() => setNova(true)}>
          <Plus />
          Nova proposta
        </Button>
      }
    >
      <DemoNotice>
        Prévia comercial com dados fictícios. Criar e alterar propostas aqui não gera contrato nem
        envia mensagens.
      </DemoNotice>
      <Panel>
        <div className="flex flex-wrap">
          <Metric
            label="Propostas em aberto"
            value={String(
              propostas.filter((p) => !['Aceita', 'Expirada'].includes(p.status)).length,
            )}
            detail="Preparação e acompanhamento"
          />
          <Metric
            label="Aguardando retorno"
            value={String(propostas.filter((p) => p.status === 'Aguardando retorno').length)}
            detail="Oportunidades de continuar a conversa"
          />
          <Metric
            label="Aceitas"
            value={String(propostas.filter((p) => p.status === 'Aceita').length)}
            detail="Exemplo de resultado comercial"
          />
        </div>
      </Panel>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle p-4">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute top-2.5 left-3 size-4 text-ink-3" />
            <Input
              className="h-9 pl-9"
              placeholder="Buscar proposta ou contato"
              aria-label="Buscar proposta"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Select value={filtro} onValueChange={setFiltro}>
            <SelectTrigger aria-label="Filtrar propostas" className="h-9 w-52 cursor-pointer bg-panel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['Todas', 'Em preparação', 'Aguardando retorno', 'Aceita', 'Expirada'].map((s) => (
                <SelectItem key={s} value={s} className="cursor-pointer">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-xs text-ink-3">
              <tr>
                {['Proposta e contato', 'Interesse', 'Produto', 'Situação', ''].map((v, i) => (
                  <th key={i} className="px-5 py-3 font-semibold">
                    {v}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {lista.map((p) => (
                <tr key={p.id} className="hover:bg-canvas">
                  <td className="px-5 py-4">
                    <span className="block font-bold">{p.nome}</span>
                    <span className="text-xs text-ink-3">
                      {p.id} / {p.data}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-ink-2">{p.interesse}</td>
                  <td className="px-5 py-4">{p.produto}</td>
                  <td className="px-5 py-4">
                    <Pill
                      tone={
                        p.status === 'Aceita'
                          ? 'green'
                          : p.status === 'Aguardando retorno'
                            ? 'amber'
                            : 'neutral'
                      }
                    >
                      {p.status}
                    </Pill>
                  </td>
                  <td className="px-5 py-4">
                    <Button variant="ghost" onClick={() => setAtual(p)}>
                      Ver proposta
                      <ChevronRight />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!lista.length && (
            <p className="p-10 text-center text-ink-3">Nenhuma proposta encontrada.</p>
          )}
        </div>
      </Panel>
      <Dialog open={nova} onOpenChange={setNova}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preparar proposta</DialogTitle>
            <DialogDescription>
              Crie um rascunho demonstrativo a partir de um contato.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPropostas((p) => [
                {
                  id: `PRO-${1030 + p.length}`,
                  nome: cliente!,
                  interesse: interesses[nomes.indexOf(cliente!)]?.detalhe ?? 'A informar',
                  produto,
                  status: 'Em preparação',
                  data: '11 nov. 2026',
                },
                ...p,
              ]);
              setNova(false);
              toast.success('Rascunho demonstrativo criado.');
            }}
            className="space-y-4"
          >
            <label className="block space-y-2 text-sm font-semibold">
              <span>Contato</span>
              <Select value={cliente} onValueChange={setCliente}>
                <SelectTrigger className="h-10 w-full cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {nomes.map((n) => (
                    <SelectItem key={n} value={n} className="cursor-pointer">
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-2 text-sm font-semibold">
              <span>Produto</span>
              <Select value={produto} onValueChange={setProduto}>
                <SelectTrigger className="h-10 w-full cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUTOS_PROPOSTA.map((n) => (
                    <SelectItem key={n} value={n} className="cursor-pointer">
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="rounded-card bg-canvas p-3 text-sm text-ink-2">
              {produto === 'Plano Essencial'
                ? 'Plano Essencial a partir de R$ 69,90/mês.'
                : `${produto} sob cotação.`}{' '}
              Valores e condições dependem da análise comercial.
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setNova(false)}>
                Cancelar
              </Button>
              <Button type="submit">Criar rascunho</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!atual} onOpenChange={(v) => !v && setAtual(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Proposta {atual?.id}</DialogTitle>
            <DialogDescription>
              Prévia demonstrativa. As condições finais dependem da aprovação comercial.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-panel border border-line p-5">
            <div className="mb-5 flex items-center justify-between">
              <span className="font-display text-lg font-bold text-noite">{EMPRESA_NOME}</span>
              <ShieldCheck className="size-6 text-sinal" />
            </div>
            <div className="text-xs text-ink-3">Preparada para</div>
            <h3 className="mt-1 text-xl font-semibold">{atual?.nome}</h3>
            <div className="my-5 grid grid-cols-2 gap-4 border-y border-line-subtle py-4">
              <div>
                <span className="text-xs text-ink-3">Interesse</span>
                <p className="mt-1 font-medium">{atual?.interesse}</p>
              </div>
              <div>
                <span className="text-xs text-ink-3">Solução</span>
                <p className="mt-1 font-medium">{atual?.produto}</p>
              </div>
            </div>
            <p className="text-sm text-ink-2">
              {atual?.produto === 'Plano Essencial'
                ? 'Plano Essencial a partir de R$ 69,90/mês.'
                : `${atual?.produto ?? 'Solução'} sob cotação.`}{' '}
              Benefícios conforme plano e condições contratadas.
            </p>
          </div>
          <DialogFooter>
            <EmDesenvolvimento recurso="Gerar PDF">
              {(abrir) => (
                <Button variant="outline" className="cursor-pointer" onClick={abrir}>
                  Gerar PDF
                </Button>
              )}
            </EmDesenvolvimento>
            <Button
              variant="outline"
              onClick={() => {
                if (atual) {
                  setPropostas((p) =>
                    p.map((v) => (v.id === atual.id ? { ...v, status: 'Aguardando retorno' } : v)),
                  );
                  setAtual(null);
                  toast.success(
                    'Situação alterada apenas nesta demonstração. Nenhuma mensagem enviada.',
                  );
                }
              }}
            >
              Simular envio da proposta
            </Button>
            <Button
              onClick={() => {
                if (atual) {
                  setPropostas((p) =>
                    p.map((v) => (v.id === atual.id ? { ...v, status: 'Aceita' } : v)),
                  );
                  setAtual(null);
                  toast.success('Aceite demonstrativo registrado.');
                }
              }}
            >
              Simular aceite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

