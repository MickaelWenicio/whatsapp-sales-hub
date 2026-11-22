'use client';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AvatarAgente, CabecalhoEtapa, Campo, classeInput } from '../comum';
import {
  CORES,
  DESCRICAO_MAX,
  FUNCOES,
  TONS,
  rotulo,
  type CorAvatar,
  type FuncaoAgente,
  type PropsEtapa,
  type TomVoz,
} from '../tipos';

export function EtapaIdentidade({ r, alterar, erros, mostrarErros }: PropsEtapa) {
  const erro = (k: string) => (mostrarErros ? erros[k] : undefined);
  const restante = DESCRICAO_MAX - r.descricao.length;
  const tom = TONS.find((t) => t.v === r.tom);

  return (
    <div>
      <CabecalhoEtapa
        titulo="Identidade"
        descricao="Como o agente aparece para a sua equipe e como ele se apresenta aos clientes."
      />

      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-card border border-line-subtle bg-canvas p-4">
        <AvatarAgente nome={r.nome || 'Novo agente'} cor={r.cor} tamanho="lg" />
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-[15px] font-bold', r.nome.trim() ? 'text-ink' : 'text-ink-3')}>
            {r.nome.trim() || 'Nome do agente'}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-ink-3">
            {rotulo(FUNCOES, r.funcao) || 'Função ainda não escolhida'}
          </p>
        </div>
        <div>
          <span id="agente-cor-rotulo" className="mb-2 block text-xs font-semibold text-ink-3">
            Cor do avatar
          </span>
          <RadioGroup
            aria-labelledby="agente-cor-rotulo"
            value={r.cor}
            onValueChange={(v) => alterar({ cor: v as CorAvatar })}
            className="flex w-auto gap-2.5"
          >
            {CORES.map((c) => (
              <RadioGroupItem
                key={c.v}
                value={c.v}
                aria-label={c.t}
                title={c.t}
                className={cn(
                  'size-7 cursor-pointer border-2 border-panel shadow-[0_0_0_1px_var(--border-default)] after:-inset-1 data-checked:border-panel data-checked:shadow-[0_0_0_2px_var(--text-primary)] focus-visible:border-panel focus-visible:ring-2 focus-visible:ring-sinal focus-visible:ring-offset-2',
                  c.amostra,
                )}
              />
            ))}
          </RadioGroup>
        </div>
      </div>

      <div className="space-y-5">
        <Campo
          rotulo="Nome do agente"
          htmlFor="agente-nome"
          erro={erro('nome')}
          erroId="agente-nome-erro"
          ajuda="É o nome que o cliente vê quando o agente se apresenta."
        >
          <Input
            id="agente-nome"
            value={r.nome}
            maxLength={60}
            autoComplete="off"
            placeholder="Ex.: Ana, do pós-venda"
            aria-invalid={!!erro('nome')}
            aria-describedby={erro('nome') ? 'agente-nome-erro' : undefined}
            onChange={(e) => alterar({ nome: e.target.value })}
            className={classeInput}
          />
        </Campo>

        <div className="grid gap-5 sm:grid-cols-2">
          <Campo rotulo="Função" htmlFor="agente-funcao" erro={erro('funcao')} erroId="agente-funcao-erro">
            <Select value={r.funcao} onValueChange={(v) => alterar({ funcao: v as FuncaoAgente })}>
              <SelectTrigger
                id="agente-funcao"
                size="lg"
                className="w-full"
                aria-invalid={!!erro('funcao')}
                aria-describedby={erro('funcao') ? 'agente-funcao-erro' : undefined}
              >
                <SelectValue placeholder="Escolha a função" />
              </SelectTrigger>
              <SelectContent>
                {FUNCOES.map((f) => (
                  <SelectItem key={f.v} value={f.v}>
                    {f.t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>

          <Campo rotulo="Tom de voz" htmlFor="agente-tom" ajuda={tom?.d}>
            <Select value={r.tom} onValueChange={(v) => alterar({ tom: v as TomVoz })}>
              <SelectTrigger id="agente-tom" size="lg" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONS.map((t) => (
                  <SelectItem key={t.v} value={t.v}>
                    {t.t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
        </div>

        <Campo
          rotulo="Descrição"
          htmlFor="agente-descricao"
          erro={erro('descricao')}
          erroId="agente-descricao-erro"
          extra={
            <span
              className={cn('tabular text-xs font-semibold', restante <= 20 ? 'text-pau-fg' : 'text-ink-3')}
            >
              {r.descricao.length}/{DESCRICAO_MAX}
            </span>
          }
        >
          <Textarea
            id="agente-descricao"
            value={r.descricao}
            maxLength={DESCRICAO_MAX}
            rows={3}
            placeholder="O que esse agente faz e com quem ele fala"
            aria-invalid={!!erro('descricao')}
            aria-describedby={erro('descricao') ? 'agente-descricao-erro' : undefined}
            onChange={(e) => alterar({ descricao: e.target.value })}
            className="min-h-24 rounded-control border-line-control bg-panel px-3 py-2.5 text-sm leading-[22px] text-ink placeholder:text-ink-3 focus-visible:border-sinal focus-visible:ring-2 focus-visible:ring-sinal/35"
          />
        </Campo>
      </div>
    </div>
  );
}
