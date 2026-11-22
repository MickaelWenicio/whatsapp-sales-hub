'use client';

import { useState } from 'react';
import { Plus, UserRound, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CabecalhoEtapa, Campo, ErroCampo, classeInput } from '../comum';
import { APRESENTACAO_MAX, OBJETIVOS, type Objetivo, type PropsEtapa } from '../tipos';

export function EtapaComportamento({ r, alterar, erros, mostrarErros }: PropsEtapa) {
  const [nova, setNova] = useState('');
  const [erroNova, setErroNova] = useState('');
  const erro = (k: string) => (mostrarErros ? erros[k] : undefined);

  function adicionar() {
    const t = nova.trim();
    if (!t) return setErroNova('Escreva a situação antes de adicionar.');
    if (r.regrasTransferencia.some((x) => x.toLowerCase() === t.toLowerCase()))
      return setErroNova('Essa situação já está na lista.');
    alterar((x) => ({ regrasTransferencia: [...x.regrasTransferencia, t] }));
    setNova('');
    setErroNova('');
  }

  return (
    <div>
      <CabecalhoEtapa
        titulo="Comportamento"
        descricao="O que o agente busca em cada conversa e em que momento ele chama alguém da equipe."
      />

      <div className="space-y-6">
        <Campo rotulo="Objetivo principal" htmlFor="agente-objetivo" className="max-w-md">
          <Select value={r.objetivo} onValueChange={(v) => alterar({ objetivo: v as Objetivo })}>
            <SelectTrigger id="agente-objetivo" size="lg" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OBJETIVOS.map((o) => (
                <SelectItem key={o.v} value={o.v}>
                  {o.t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>

        <div>
          <span id="agente-regras-rotulo" className="block text-sm font-semibold text-ink">
            Quando transferir para uma pessoa
          </span>
          <p className="mt-0.5 mb-3 text-[13px] text-ink-3">
            O agente passa a conversa para a equipe sempre que uma destas situações acontecer.
          </p>
          <ul
            aria-labelledby="agente-regras-rotulo"
            className={cn(
              'divide-y divide-line-subtle rounded-card border',
              erro('regras') ? 'border-emg-border' : 'border-line',
            )}
          >
            {r.regrasTransferencia.map((t, i) => (
              <li key={`${t}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                <UserRound className="size-4 shrink-0 text-hum-fg" aria-hidden />
                <span className="min-w-0 flex-1 text-sm text-ink">{t}</span>
                <button
                  type="button"
                  aria-label={`Remover a regra ${t}`}
                  onClick={() =>
                    alterar((x) => ({ regrasTransferencia: x.regrasTransferencia.filter((_, j) => j !== i) }))
                  }
                  className="cursor-pointer rounded-control p-1.5 text-ink-3 transition-colors duration-[120ms] hover:bg-chat hover:text-ink focus-visible:ring-2 focus-visible:ring-sinal focus-visible:outline-none"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
            {r.regrasTransferencia.length === 0 && (
              <li className="px-4 py-3 text-sm text-ink-3">Nenhuma situação. Adicione a primeira abaixo.</li>
            )}
          </ul>
          <ErroCampo id="agente-regras-erro">{erro('regras')}</ErroCampo>
          <div className="mt-3 flex gap-2">
            <label htmlFor="agente-nova-regra" className="sr-only">
              Nova situação de transferência
            </label>
            <Input
              id="agente-nova-regra"
              value={nova}
              maxLength={160}
              autoComplete="off"
              placeholder="Ex.: Cliente quer cancelar o contrato"
              aria-invalid={!!erroNova}
              aria-describedby={erroNova ? 'agente-nova-regra-erro' : undefined}
              onChange={(e) => {
                setNova(e.target.value);
                if (erroNova) setErroNova('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  adicionar();
                }
              }}
              className={classeInput}
            />
            <Button type="button" variant="outline" className="h-10 cursor-pointer px-3" onClick={adicionar}>
              <Plus />
              Adicionar
            </Button>
          </div>
          <ErroCampo id="agente-nova-regra-erro">{erroNova}</ErroCampo>
        </div>

        <Campo
          rotulo="Mensagem de apresentação"
          htmlFor="agente-apresentacao"
          ajuda="Opcional. Se ficar em branco, o agente se apresenta de forma natural."
          extra={
            <span className="tabular text-xs font-semibold text-ink-3">
              {r.apresentacao.length}/{APRESENTACAO_MAX}
            </span>
          }
        >
          <Textarea
            id="agente-apresentacao"
            value={r.apresentacao}
            maxLength={APRESENTACAO_MAX}
            rows={3}
            placeholder="Ex.: Oi! Eu sou a Ana, do pós-venda. Estou aqui para ajudar com o seu plano."
            onChange={(e) => alterar({ apresentacao: e.target.value })}
            className="min-h-24 rounded-control border-line-control bg-panel px-3 py-2.5 text-sm leading-[22px] text-ink placeholder:text-ink-3 focus-visible:border-sinal focus-visible:ring-2 focus-visible:ring-sinal/35"
          />
        </Campo>
      </div>
    </div>
  );
}
