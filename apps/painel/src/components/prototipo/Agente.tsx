'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Check, Package, Pencil, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { bff, BffError } from '@/lib/bff';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmDesenvolvimento } from '@/components/ui/em-desenvolvimento';
import { ListaAgentes } from '@/components/agentes/ListaAgentes';
import { DemoNotice, Page, Panel, Pill } from './comum';

type Produto = {
  id: string;
  slug: string;
  nome: string;
  descricao: string;
  beneficios: string[];
  condicoes: string;
  aprovado: boolean;
};
type Preco = {
  id: string;
  productId: string;
  rotulo: string;
  valorCentavos: number | null;
  sobCotacao: boolean;
  aprovado: boolean;
};
type Faq = { id: string; pergunta: string; resposta: string; aprovado: boolean };
type Catalogo = { produtos: Produto[]; precos: Preco[]; faqs: Faq[] };

const reais = (c: number) =>
  (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const paraCentavos = (v: string) => {
  const n = Number(v.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};
const erroMsg = (e: unknown) => (e instanceof BffError ? e.message : 'Não foi possível salvar. Tente de novo.');

type Confirmar = { titulo: string; detalhe: string; acao: () => Promise<void> } | null;

function ListaLocal({
  itens,
  setItens,
  rotuloAdicionar,
}: {
  itens: string[];
  setItens: (v: string[]) => void;
  rotuloAdicionar: string;
}) {
  const [novo, setNovo] = useState('');
  function adicionar() {
    const t = novo.trim();
    if (!t) return;
    setItens([...itens, t]);
    setNovo('');
    toast.success('Item adicionado.');
  }
  return (
    <div className="space-y-3 p-5">
      {itens.map((t, i) => (
        <div key={`${t}-${i}`} className="flex items-center gap-2 text-sm">
          <Check className="size-4 shrink-0 text-hum-fg" />
          <span className="flex-1">{t}</span>
          <button
            aria-label={`Remover ${t}`}
            className="cursor-pointer rounded p-1 text-ink-3 hover:bg-chat hover:text-ink"
            onClick={() => {
              setItens(itens.filter((_, j) => j !== i));
              toast.success('Item removido.');
            }}
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
      {itens.length === 0 && <p className="text-sm text-ink-3">Nenhum item. Adicione o primeiro abaixo.</p>}
      <div className="flex gap-2 pt-1">
        <Input
          aria-label={rotuloAdicionar}
          placeholder={rotuloAdicionar}
          className="h-9"
          value={novo}
          maxLength={200}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && adicionar()}
        />
        <Button variant="outline" className="h-9 cursor-pointer" onClick={adicionar}>
          <Plus />
          Adicionar
        </Button>
      </div>
    </div>
  );
}

function ProdutoCard({
  p,
  precos,
  salvarProduto,
  pedirRemocao,
  mut,
}: {
  p: Produto;
  precos: Preco[];
  salvarProduto: (p: Produto, parcial: Partial<Produto>) => Promise<void>;
  pedirRemocao: (c: Confirmar) => void;
  mut: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState({ nome: p.nome, descricao: p.descricao, condicoes: p.condicoes });
  const [novoBen, setNovoBen] = useState('');
  const [novoPreco, setNovoPreco] = useState({ rotulo: '', valor: '', sob: false });
  const [editPreco, setEditPreco] = useState<{ id: string; rotulo: string; valor: string; sob: boolean } | null>(
    null,
  );

  return (
    <div className="space-y-4 p-5">
      <div className="flex items-start gap-3">
        <Package className="mt-1 size-5 shrink-0 text-sinal" />
        <div className="min-w-0 flex-1">
          {editando ? (
            <div className="space-y-2">
              <Input
                aria-label="Nome do produto"
                className="h-9"
                value={rascunho.nome}
                maxLength={120}
                onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
              />
              <Textarea
                aria-label="Descrição"
                value={rascunho.descricao}
                maxLength={1000}
                onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
              />
              <Input
                aria-label="Condições"
                className="h-9"
                placeholder="Condições"
                value={rascunho.condicoes}
                maxLength={1000}
                onChange={(e) => setRascunho({ ...rascunho, condicoes: e.target.value })}
              />
              <div className="flex gap-2">
                <Button
                  className="h-8 cursor-pointer"
                  onClick={async () => {
                    await salvarProduto(p, rascunho);
                    setEditando(false);
                  }}
                >
                  Salvar
                </Button>
                <Button variant="outline" className="h-8 cursor-pointer" onClick={() => setEditando(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h4 className="font-bold">{p.nome}</h4>
              <p className="mt-1 text-sm text-ink-2">{p.descricao}</p>
              {p.condicoes && <p className="mt-1 text-xs text-ink-3">{p.condicoes}</p>}
            </>
          )}
        </div>
        <Switch
          className="cursor-pointer"
          aria-label={`Aprovar ${p.nome}`}
          checked={p.aprovado}
          onCheckedChange={(v) => void salvarProduto(p, { aprovado: v })}
        />
        <Pill tone={p.aprovado ? 'green' : 'neutral'}>{p.aprovado ? 'Aprovado' : 'Pausado'}</Pill>
        {!editando && (
          <>
            <button
              aria-label={`Editar ${p.nome}`}
              className="cursor-pointer rounded p-1 text-ink-3 hover:bg-chat hover:text-ink"
              onClick={() => {
                setRascunho({ nome: p.nome, descricao: p.descricao, condicoes: p.condicoes });
                setEditando(true);
              }}
            >
              <Pencil className="size-4" />
            </button>
            <button
              aria-label={`Remover ${p.nome}`}
              className="cursor-pointer rounded p-1 text-ink-3 hover:bg-chat hover:text-ink"
              onClick={() =>
                pedirRemocao({
                  titulo: `Remover ${p.nome}?`,
                  detalhe: 'Os preços deste produto também serão removidos.',
                  acao: () => mut(() => bff.post(`catalogo/produtos/${p.id}/remover`), 'Produto removido.'),
                })
              }
            >
              <Trash2 className="size-4" />
            </button>
          </>
        )}
      </div>

      <div className="pl-8">
        <span className="text-xs font-bold text-ink-3">Benefícios</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {p.beneficios.map((b, i) => (
            <span
              key={`${b}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-chat px-3 py-1 text-xs font-semibold text-ink-2"
            >
              {b}
              <button
                aria-label={`Remover benefício ${b}`}
                className="cursor-pointer text-ink-3 hover:text-ink"
                onClick={() =>
                  void salvarProduto(p, { beneficios: p.beneficios.filter((_, j) => j !== i) })
                }
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {p.beneficios.length === 0 && <span className="text-xs text-ink-3">Nenhum benefício.</span>}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            aria-label="Novo benefício"
            placeholder="Novo benefício"
            className="h-8 max-w-xs"
            value={novoBen}
            maxLength={300}
            onChange={(e) => setNovoBen(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && novoBen.trim()) {
                await salvarProduto(p, { beneficios: [...p.beneficios, novoBen.trim()] });
                setNovoBen('');
              }
            }}
          />
          <Button
            variant="outline"
            className="h-8 cursor-pointer"
            onClick={async () => {
              if (!novoBen.trim()) return;
              await salvarProduto(p, { beneficios: [...p.beneficios, novoBen.trim()] });
              setNovoBen('');
            }}
          >
            <Plus />
            Adicionar
          </Button>
        </div>

        <span className="mt-4 block text-xs font-bold text-ink-3">Preços</span>
        <div className="mt-2 divide-y divide-line-subtle rounded-control border border-line">
          {precos.map((pr) =>
            editPreco?.id === pr.id ? (
              <div key={pr.id} className="flex flex-wrap items-center gap-2 p-2">
                <Input
                  aria-label="Rótulo do preço"
                  className="h-8 w-48"
                  value={editPreco.rotulo}
                  onChange={(e) => setEditPreco({ ...editPreco, rotulo: e.target.value })}
                />
                <Input
                  aria-label="Valor em reais"
                  className="h-8 w-28"
                  placeholder="69,90"
                  disabled={editPreco.sob}
                  value={editPreco.valor}
                  onChange={(e) => setEditPreco({ ...editPreco, valor: e.target.value })}
                />
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <Switch
                    className="cursor-pointer"
                    checked={editPreco.sob}
                    onCheckedChange={(v) => setEditPreco({ ...editPreco, sob: v })}
                  />
                  Sob cotação
                </label>
                <Button
                  className="h-8 cursor-pointer"
                  onClick={async () => {
                    const c = editPreco.sob ? null : paraCentavos(editPreco.valor);
                    if (!editPreco.sob && c === null) return void toast.error('Informe um valor válido.');
                    await mut(
                      () =>
                        bff.put(`catalogo/precos/${pr.id}`, {
                          productId: p.id,
                          rotulo: editPreco.rotulo,
                          valorCentavos: c,
                          sobCotacao: editPreco.sob,
                          aprovado: pr.aprovado,
                        }),
                      'Preço atualizado.',
                    );
                    setEditPreco(null);
                  }}
                >
                  Salvar
                </Button>
                <Button variant="ghost" className="h-8 cursor-pointer" onClick={() => setEditPreco(null)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <div key={pr.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1">{pr.rotulo}</span>
                <span className="font-bold tabular-nums">
                  {pr.sobCotacao || pr.valorCentavos === null ? 'Sob cotação' : reais(pr.valorCentavos)}
                </span>
                <button
                  aria-label={`Editar preço ${pr.rotulo}`}
                  className="cursor-pointer rounded p-1 text-ink-3 hover:bg-chat hover:text-ink"
                  onClick={() =>
                    setEditPreco({
                      id: pr.id,
                      rotulo: pr.rotulo,
                      valor:
                        pr.valorCentavos === null
                          ? ''
                          : (pr.valorCentavos / 100).toFixed(2).replace('.', ','),
                      sob: pr.sobCotacao,
                    })
                  }
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  aria-label={`Remover preço ${pr.rotulo}`}
                  className="cursor-pointer rounded p-1 text-ink-3 hover:bg-chat hover:text-ink"
                  onClick={() =>
                    pedirRemocao({
                      titulo: `Remover o preço "${pr.rotulo}"?`,
                      detalhe: 'O agente deixa de usar este preço nas próximas conversas.',
                      acao: () => mut(() => bff.post(`catalogo/precos/${pr.id}/remover`), 'Preço removido.'),
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ),
          )}
          {precos.length === 0 && <div className="px-3 py-2 text-xs text-ink-3">Nenhum preço cadastrado.</div>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            aria-label="Rótulo do novo preço"
            placeholder="Ex.: Plano mensal"
            className="h-8 w-48"
            value={novoPreco.rotulo}
            onChange={(e) => setNovoPreco({ ...novoPreco, rotulo: e.target.value })}
          />
          <Input
            aria-label="Valor do novo preço em reais"
            placeholder="69,90"
            className="h-8 w-28"
            disabled={novoPreco.sob}
            value={novoPreco.valor}
            onChange={(e) => setNovoPreco({ ...novoPreco, valor: e.target.value })}
          />
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <Switch
              className="cursor-pointer"
              checked={novoPreco.sob}
              onCheckedChange={(v) => setNovoPreco({ ...novoPreco, sob: v })}
            />
            Sob cotação
          </label>
          <Button
            variant="outline"
            className="h-8 cursor-pointer"
            onClick={async () => {
              if (!novoPreco.rotulo.trim()) return void toast.error('Informe o rótulo do preço.');
              const c = novoPreco.sob ? null : paraCentavos(novoPreco.valor);
              if (!novoPreco.sob && c === null) return void toast.error('Informe um valor válido.');
              await mut(
                () =>
                  bff.post('catalogo/precos', {
                    productId: p.id,
                    rotulo: novoPreco.rotulo,
                    valorCentavos: c,
                    sobCotacao: novoPreco.sob,
                    aprovado: true,
                  }),
                'Preço adicionado.',
              );
              setNovoPreco({ rotulo: '', valor: '', sob: false });
            }}
          >
            <Plus />
            Adicionar preço
          </Button>
        </div>
      </div>
    </div>
  );
}

function FaqLinha({
  f,
  mut,
  pedirRemocao,
}: {
  f: Faq;
  mut: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
  pedirRemocao: (c: Confirmar) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [r, setR] = useState({ pergunta: f.pergunta, resposta: f.resposta });
  if (editando) {
    return (
      <div className="space-y-2 p-5">
        <Input
          aria-label="Pergunta"
          className="h-9"
          value={r.pergunta}
          maxLength={300}
          onChange={(e) => setR({ ...r, pergunta: e.target.value })}
        />
        <Textarea
          aria-label="Resposta"
          value={r.resposta}
          maxLength={2000}
          onChange={(e) => setR({ ...r, resposta: e.target.value })}
        />
        <div className="flex gap-2">
          <Button
            className="h-8 cursor-pointer"
            onClick={async () => {
              await mut(() => bff.put(`catalogo/faqs/${f.id}`, { ...r, aprovado: f.aprovado }), 'Pergunta atualizada.');
              setEditando(false);
            }}
          >
            Salvar
          </Button>
          <Button variant="outline" className="h-8 cursor-pointer" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 p-5">
      <div className="flex-1">
        <h4 className="font-bold">{f.pergunta}</h4>
        <p className="mt-1 text-sm text-ink-2">{f.resposta}</p>
      </div>
      <Switch
        className="cursor-pointer"
        aria-label={`Aprovar ${f.pergunta}`}
        checked={f.aprovado}
        onCheckedChange={(v) =>
          void mut(
            () => bff.put(`catalogo/faqs/${f.id}`, { pergunta: f.pergunta, resposta: f.resposta, aprovado: v }),
            v ? 'Pergunta aprovada.' : 'Pergunta pausada.',
          )
        }
      />
      <button
        aria-label={`Editar ${f.pergunta}`}
        className="cursor-pointer rounded p-1 text-ink-3 hover:bg-chat hover:text-ink"
        onClick={() => {
          setR({ pergunta: f.pergunta, resposta: f.resposta });
          setEditando(true);
        }}
      >
        <Pencil className="size-4" />
      </button>
      <button
        aria-label={`Remover ${f.pergunta}`}
        className="cursor-pointer rounded p-1 text-ink-3 hover:bg-chat hover:text-ink"
        onClick={() =>
          pedirRemocao({
            titulo: 'Remover esta pergunta?',
            detalhe: f.pergunta,
            acao: () => mut(() => bff.post(`catalogo/faqs/${f.id}/remover`), 'Pergunta removida.'),
          })
        }
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function CatalogoEditor() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['catalogo'], queryFn: () => bff.get<Catalogo>('catalogo') });
  const [confirmar, setConfirmar] = useState<Confirmar>(null);
  const [novoProd, setNovoProd] = useState({ nome: '', descricao: '', condicoes: '' });
  const [novaFaq, setNovaFaq] = useState({ pergunta: '', resposta: '' });
  const m = useMutation({ mutationFn: (fn: () => Promise<unknown>) => fn() });

  async function mut(fn: () => Promise<unknown>, ok: string) {
    try {
      await m.mutateAsync(fn);
      await qc.invalidateQueries({ queryKey: ['catalogo'] });
      toast.success(ok);
    } catch (e) {
      toast.error(erroMsg(e));
    }
  }
  async function salvarProduto(p: Produto, parcial: Partial<Produto>) {
    const n = { ...p, ...parcial };
    await mut(
      () =>
        bff.put(`catalogo/produtos/${p.id}`, {
          nome: n.nome,
          descricao: n.descricao,
          beneficios: n.beneficios,
          condicoes: n.condicoes,
          aprovado: n.aprovado,
        }),
      'Produto atualizado.',
    );
  }

  if (q.isLoading) return <Panel title="Catálogo"><p className="p-5 text-sm text-ink-3">Carregando o catálogo.</p></Panel>;
  if (q.isError || !q.data) {
    return (
      <Panel title="Catálogo">
        <div className="p-5 text-sm text-ink-2">
          Não foi possível carregar o catálogo. Seu perfil precisa ser dono ou gestor.
          <div className="mt-3">
            <Button variant="outline" className="cursor-pointer" onClick={() => void q.refetch()}>
              Tentar de novo
            </Button>
          </div>
        </div>
      </Panel>
    );
  }
  const { produtos, precos, faqs } = q.data;

  return (
    <>
      <DemoNotice>
        O agente usa os itens aprovados do catálogo nas próximas conversas. As alterações são salvas na hora.
      </DemoNotice>
      <Panel title="Produtos e preços" subtitle="Valores em reais. Descreva só o que a empresa realmente oferece.">
        <div className="divide-y divide-line-subtle">
          {produtos.map((p) => (
            <ProdutoCard
              key={p.id}
              p={p}
              precos={precos.filter((x) => x.productId === p.id)}
              salvarProduto={salvarProduto}
              pedirRemocao={setConfirmar}
              mut={mut}
            />
          ))}
          {produtos.length === 0 && <p className="p-5 text-sm text-ink-3">Nenhum produto cadastrado.</p>}
          <div className="space-y-2 bg-canvas p-5">
            <h4 className="text-sm font-bold">Novo produto</h4>
            <div className="grid gap-2 md:grid-cols-2">
              <Input
                aria-label="Nome do novo produto"
                placeholder="Nome"
                className="h-9"
                value={novoProd.nome}
                maxLength={120}
                onChange={(e) => setNovoProd({ ...novoProd, nome: e.target.value })}
              />
              <Input
                aria-label="Condições do novo produto"
                placeholder="Condições (opcional)"
                className="h-9"
                value={novoProd.condicoes}
                maxLength={1000}
                onChange={(e) => setNovoProd({ ...novoProd, condicoes: e.target.value })}
              />
            </div>
            <Textarea
              aria-label="Descrição do novo produto"
              placeholder="Descrição"
              value={novoProd.descricao}
              maxLength={1000}
              onChange={(e) => setNovoProd({ ...novoProd, descricao: e.target.value })}
            />
            <Button
              className="cursor-pointer"
              onClick={async () => {
                if (!novoProd.nome.trim() || !novoProd.descricao.trim())
                  return void toast.error('Preencha nome e descrição.');
                await mut(
                  () => bff.post('catalogo/produtos', { ...novoProd, beneficios: [], aprovado: true }),
                  'Produto adicionado.',
                );
                setNovoProd({ nome: '', descricao: '', condicoes: '' });
              }}
            >
              <Plus />
              Adicionar produto
            </Button>
          </div>
        </div>
      </Panel>
      <Panel title="Perguntas frequentes" subtitle="Respostas aprovadas que o agente pode usar.">
        <div className="divide-y divide-line-subtle">
          {faqs.map((f) => (
            <FaqLinha key={f.id} f={f} mut={mut} pedirRemocao={setConfirmar} />
          ))}
          {faqs.length === 0 && <p className="p-5 text-sm text-ink-3">Nenhuma pergunta cadastrada.</p>}
          <div className="space-y-2 bg-canvas p-5">
            <h4 className="text-sm font-bold">Nova pergunta</h4>
            <Input
              aria-label="Nova pergunta"
              placeholder="Pergunta"
              className="h-9"
              value={novaFaq.pergunta}
              maxLength={300}
              onChange={(e) => setNovaFaq({ ...novaFaq, pergunta: e.target.value })}
            />
            <Textarea
              aria-label="Resposta da nova pergunta"
              placeholder="Resposta"
              value={novaFaq.resposta}
              maxLength={2000}
              onChange={(e) => setNovaFaq({ ...novaFaq, resposta: e.target.value })}
            />
            <Button
              className="cursor-pointer"
              onClick={async () => {
                if (!novaFaq.pergunta.trim() || !novaFaq.resposta.trim())
                  return void toast.error('Preencha pergunta e resposta.');
                await mut(() => bff.post('catalogo/faqs', { ...novaFaq, aprovado: true }), 'Pergunta adicionada.');
                setNovaFaq({ pergunta: '', resposta: '' });
              }}
            >
              <Plus />
              Adicionar pergunta
            </Button>
          </div>
        </div>
      </Panel>
      <Dialog open={!!confirmar} onOpenChange={(v) => !v && setConfirmar(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmar?.titulo}</DialogTitle>
            <DialogDescription>{confirmar?.detalhe}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => setConfirmar(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="cursor-pointer"
              onClick={async () => {
                const c = confirmar;
                setConfirmar(null);
                if (c) await c.acao();
              }}
            >
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const NIVEIS = [
  ['Assistida', 'A IA prepara sugestões. Uma pessoa revisa e decide o que enviar.'],
  ['Parcial', 'A IA atende e qualifica. Situações comerciais sensíveis pedem aprovação.'],
  ['Autônoma', 'A IA conduz dentro das regras aprovadas e transfere quando necessário.'],
] as const;

export function AgentePage() {
  const [aba, setAba] = useState('Operação');
  const [transferir, setTransferir] = useState([
    'Pedido explícito do cliente',
    'Emergência ou caso urgente',
    'Negociação fora das condições aprovadas',
    'Intenção de contratação ou envio de documentos',
  ]);
  const [objecoes, setObjecoes] = useState([
    'Está caro: mostrar o valor do plano por dia e o que ele resolve',
    'Vou pensar: oferecer retomar a conversa em dois dias',
  ]);

  // O cartão do agente comercial leva até a configuração dele, logo abaixo da lista.
  function abrirConfiguracao() {
    const alvo = document.getElementById('configuracao-agente');
    if (!alvo) return;
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    alvo.scrollIntoView({ behavior: reduzido ? 'auto' : 'smooth', block: 'start' });
    alvo.focus({ preventScroll: true });
  }

  return (
    <Page
      title="Uma IA com a direção da sua equipe"
      description="Defina como o agente conversa, quando atua e em quais momentos chama uma pessoa."
      demo={false}
    >
      <ListaAgentes onAbrirAgenteReal={abrirConfiguracao} />
      <div
        id="configuracao-agente"
        tabIndex={-1}
        className="-mb-1 scroll-mt-6 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-sinal focus-visible:ring-offset-4"
      >
        <h3 className="font-display text-[17px] leading-6 font-semibold text-ink">Configuração do agente comercial</h3>
        <p className="mt-1 text-sm text-ink-2">O agente que atende hoje pelo número da operação.</p>
      </div>
      <div className="flex gap-1 border-b border-line">
        {['Operação', 'Regras e catálogo'].map((t) => (
          <button
            key={t}
            onClick={() => setAba(t)}
            className={cn(
              'cursor-pointer border-b-2 px-4 py-3 text-sm font-semibold',
              aba === t ? 'border-sinal text-sinal-forte' : 'border-transparent text-ink-3 hover:text-ink',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {aba === 'Operação' && (
            <>
              <Panel title="Nível de autonomia" subtitle="A participação humana é uma escolha da operação.">
                <div className="space-y-3 p-5">
                  {NIVEIS.map(([t, d]) => (
                    <EmDesenvolvimento key={t} recurso="Nível de autonomia">
                      {(abrir) => (
                        <button
                          onClick={t === 'Autônoma' ? undefined : abrir}
                          aria-pressed={t === 'Autônoma'}
                          className={cn(
                            'flex w-full cursor-pointer items-start gap-3 rounded-card border p-4 text-left',
                            t === 'Autônoma' ? 'border-ia-border bg-ia-bg' : 'border-line',
                          )}
                        >
                          <span
                            className={cn(
                              'mt-1 size-4 shrink-0 rounded-full border-2',
                              t === 'Autônoma' ? 'border-sinal bg-sinal' : 'border-line',
                            )}
                          />
                          <span>
                            <span className="font-bold">{t}</span>
                            <span className="mt-1 block text-sm text-ink-2">{d}</span>
                          </span>
                        </button>
                      )}
                    </EmDesenvolvimento>
                  ))}
                </div>
              </Panel>
              <Panel title="Horário de atendimento">
                <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="text-sm">
                    <span className="font-semibold">De segunda a sexta, das 08:00 às 18:00</span>
                    <span className="mt-1 block text-xs text-ink-3">Horário de Brasília</span>
                  </div>
                  <EmDesenvolvimento recurso="Horário de atendimento">
                    {(abrir) => (
                      <Button variant="outline" className="cursor-pointer" onClick={abrir}>
                        Editar horário
                      </Button>
                    )}
                  </EmDesenvolvimento>
                </div>
              </Panel>
              <Panel title="Estilo da conversa">
                <div className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <h4 className="font-bold">Emojis moderados</h4>
                    <p className="mt-1 text-sm text-ink-2">Uma conversa natural, sem exageros.</p>
                  </div>
                  <EmDesenvolvimento recurso="Emojis moderados">
                    {(abrir) => (
                      <Switch
                        className="cursor-pointer"
                        aria-label="Emojis moderados"
                        checked
                        onCheckedChange={abrir}
                      />
                    )}
                  </EmDesenvolvimento>
                </div>
              </Panel>
            </>
          )}
          {aba === 'Regras e catálogo' && (
            <>
              <CatalogoEditor />
              <Panel title="Quando transferir para uma pessoa" subtitle="Lista de exemplo. Alterações valem só nesta tela.">
                <ListaLocal itens={transferir} setItens={setTransferir} rotuloAdicionar="Nova regra de transferência" />
              </Panel>
              <Panel title="Respostas a objeções" subtitle="Lista de exemplo. Alterações valem só nesta tela.">
                <ListaLocal itens={objecoes} setItens={setObjecoes} rotuloAdicionar="Nova resposta a objeção" />
              </Panel>
            </>
          )}
        </div>
        <div className="space-y-5">
          <Panel title="Prévia da conversa" subtitle="Veja o tom do agente.">
            <div className="min-h-64 space-y-4 bg-chat p-5">
              <div className="max-w-[85%] rounded-xl rounded-tl-sm border border-line bg-white p-3 text-sm">
                Oi! Queria saber mais sobre os planos de vocês.
                <div className="mt-2 text-right text-xs text-ink-3">10:30</div>
              </div>
              <div className="ml-auto max-w-[90%] rounded-xl rounded-tr-sm border border-ia-border bg-ia-bg p-3 text-sm">
                Claro! Me conta para quantas pessoas seria e o que você usa hoje, que eu já te explico as opções.
                <div className="mt-2 flex items-center justify-end gap-1 text-xs text-ia-fg">
                  <Bot className="size-3" />
                  IA 10:30
                </div>
              </div>
            </div>
          </Panel>
          <Panel>
            <div className="p-5">
              <ShieldCheck className="mb-3 size-6 text-noite" />
              <h3 className="font-bold">Limites que protegem a operação</h3>
              <ul className="mt-3 space-y-3 text-sm text-ink-2">
                <li>Usar apenas preços e condições aprovados.</li>
                <li>Uma pergunta por vez, com mensagens curtas.</li>
                <li>Não confirmar venda sem evidência.</li>
                <li>Respeitar a intervenção humana.</li>
              </ul>
            </div>
          </Panel>
        </div>
      </div>
    </Page>
  );
}
