'use client';

import { useState } from 'react';
import { CheckCheck, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { bff } from '@/lib/bff';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Pill } from '../prototipo/comum';

export interface Variacao {
  id: string;
  modeloIndex: number;
  texto: string;
}

export const MODELOS_PADRAO = [
  'Oi, {nome}! Aqui é da equipe comercial. Você chegou a avaliar a proposta de {interesse}? Posso te ajudar com alguma dúvida.',
  'Olá, {nome}, tudo bem? Faz um tempo que conversamos sobre {interesse}. Ainda faz sentido para você? Se quiser, retomo de onde paramos.',
  '{nome}, passando para saber se você ainda tem interesse em {interesse}. O Plano Essencial começa a partir de R$ 69,90/mês. Quer que eu te explique como funciona?',
];

const MAX_MODELOS = 5;
let contador = 0;
const novoId = () => `v${Date.now()}-${contador++}`;

export function preencher(texto: string, nome: string, interesse: string) {
  return texto.replaceAll('{nome}', nome).replaceAll('{interesse}', interesse);
}

async function chamarIA(modelos: string[], quantidade: number) {
  const r = await bff.post<{ variacoes: { modeloIndex: number; texto: string }[] }>(
    'recuperacao/variacoes',
    { modelos, quantidade },
  );
  return r.variacoes;
}

export function PassoMensagem({
  modelos,
  setModelos,
  variacoes,
  setVariacoes,
}: {
  modelos: string[];
  setModelos: (m: string[]) => void;
  variacoes: Variacao[];
  setVariacoes: (v: Variacao[]) => void;
}) {
  const [quantidade, setQuantidade] = useState('2');
  const [gerando, setGerando] = useState(false);
  const [regenerando, setRegenerando] = useState<string | null>(null);
  const validos = modelos.every((m) => m.trim().length >= 10);

  function editar(i: number, texto: string) {
    setModelos(modelos.map((m, k) => (k === i ? texto : m)));
    // variações do modelo editado ficam desatualizadas
    setVariacoes(variacoes.filter((v) => v.modeloIndex !== i));
  }
  function remover(i: number) {
    setModelos(modelos.filter((_, k) => k !== i));
    setVariacoes(
      variacoes
        .filter((v) => v.modeloIndex !== i)
        .map((v) => (v.modeloIndex > i ? { ...v, modeloIndex: v.modeloIndex - 1 } : v)),
    );
  }

  async function gerar() {
    setGerando(true);
    try {
      const novas = await chamarIA(modelos, Number(quantidade));
      if (novas.length === 0) {
        toast.error('A IA não devolveu variações aprovadas. Tente de novo.');
        return;
      }
      setVariacoes(novas.map((v) => ({ id: novoId(), ...v })));
      toast.success(`${novas.length} variações geradas.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível gerar as variações.');
    } finally {
      setGerando(false);
    }
  }

  async function regenerar(v: Variacao) {
    setRegenerando(v.id);
    try {
      const novas = await chamarIA([modelos[v.modeloIndex]!], 1);
      const nova = novas[0];
      if (!nova) {
        toast.error('A IA não devolveu uma variação aprovada. Tente de novo.');
        return;
      }
      setVariacoes(variacoes.map((x) => (x.id === v.id ? { ...x, texto: nova.texto } : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível gerar a variação.');
    } finally {
      setRegenerando(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-bold">Modelos de mensagem</h4>
        <p className="mt-1 text-sm text-ink-2">
          A IA cria variações de cada modelo para que nenhuma mensagem saia igual à outra. Isso
          reduz o risco de bloqueio do número.
        </p>
        <p className="mt-1 text-xs text-ink-3">
          Use {'{nome}'} e {'{interesse}'} onde quiser personalizar. Cada modelo tem de 10 a 600
          caracteres.
        </p>
      </div>

      <div className="space-y-4">
        {modelos.map((m, i) => (
          <div key={i} className="rounded-card border border-line p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label htmlFor={`modelo-${i}`} className="text-sm font-bold">
                Modelo {i + 1}
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer"
                onClick={() => remover(i)}
                disabled={modelos.length === 1}
                aria-label={`Remover modelo ${i + 1}`}
              >
                <Trash2 />
                Remover
              </Button>
            </div>
            <Textarea
              id={`modelo-${i}`}
              className="min-h-24"
              maxLength={600}
              value={m}
              onChange={(e) => editar(i, e.target.value)}
            />
            <div className="mt-2 rounded-xl rounded-tr-sm border border-ia-border bg-ia-bg p-3 text-sm leading-6">
              <span className="mb-1 block text-xs font-semibold text-ia-fg">
                Prévia para Mariana
              </span>
              {preencher(m, 'Mariana', 'Honda Bros')}
              <div className="mt-1 text-right text-xs text-ia-fg">
                IA <CheckCheck className="ml-1 inline size-3.5" />
              </div>
            </div>
          </div>
        ))}
        <Button
          variant="outline"
          className="cursor-pointer"
          onClick={() => setModelos([...modelos, ''])}
          disabled={modelos.length >= MAX_MODELOS}
        >
          <Plus />
          Adicionar modelo
        </Button>
        {modelos.length >= MAX_MODELOS && (
          <span className="ml-3 text-xs text-ink-3">Máximo de {MAX_MODELOS} modelos.</span>
        )}
      </div>

      <div className="rounded-card bg-canvas p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 text-xs font-semibold text-ink-3">Variações por modelo</div>
            <Select value={quantidade} onValueChange={setQuantidade}>
              <SelectTrigger aria-label="Variações por modelo" className="h-10 w-28 cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['1', '2', '3', '4'].map((q) => (
                  <SelectItem key={q} value={q} className="cursor-pointer">
                    {q}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="cursor-pointer" onClick={gerar} disabled={gerando || !validos}>
            <Sparkles className={gerando ? 'animate-pulse' : ''} />
            {gerando ? 'Gerando variações...' : 'Gerar variações com IA'}
          </Button>
          {!validos && (
            <span className="text-xs text-ink-3">
              Preencha todos os modelos com pelo menos 10 caracteres.
            </span>
          )}
        </div>
        {gerando && (
          <div className="mt-4 space-y-2" aria-live="polite">
            <p className="text-sm text-ink-2">A IA está escrevendo as variações. Isso leva alguns segundos.</p>
            {[0, 1, 2].map((k) => (
              <div key={k} className="h-10 animate-pulse rounded-control bg-sunken" />
            ))}
          </div>
        )}
      </div>

      {variacoes.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-bold">Variações geradas</h4>
          {modelos.map((_, i) => {
            const doModelo = variacoes.filter((v) => v.modeloIndex === i);
            if (doModelo.length === 0) return null;
            return (
              <div key={i}>
                <div className="mb-2 flex items-center gap-2">
                  <Pill tone="blue">Modelo {i + 1}</Pill>
                  <span className="text-xs text-ink-3">{doModelo.length} variações</span>
                </div>
                <ul className="space-y-2">
                  {doModelo.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-start gap-3 rounded-card border border-line p-3"
                    >
                      <p className="flex-1 text-sm leading-6">
                        {regenerando === v.id ? (
                          <span className="text-ink-3">Gerando nova variação...</span>
                        ) : (
                          v.texto
                        )}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="cursor-pointer"
                        aria-label="Gerar outra variação"
                        title="Gerar outra variação"
                        onClick={() => regenerar(v)}
                        disabled={regenerando !== null || gerando}
                      >
                        <RefreshCw className={regenerando === v.id ? 'animate-spin' : ''} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="cursor-pointer"
                        aria-label="Remover variação"
                        title="Remover variação"
                        onClick={() => setVariacoes(variacoes.filter((x) => x.id !== v.id))}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
