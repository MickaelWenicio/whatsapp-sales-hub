'use client';

import { useEffect, useState } from 'react';
import { Info, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmDesenvolvimentoDialog } from '@/components/ui/em-desenvolvimento';
import { CabecalhoEtapa, Campo, ErroCampo, classeInput, type NumeroOperacao } from '../comum';
import { HORARIOS, mascararCelular, type Horario, type OrigemNumero, type PropsEtapa } from '../tipos';

const classeOpcao =
  'rounded-card border p-4 transition-colors duration-[120ms] has-[button[data-state=checked]]:border-sinal has-[button[data-state=checked]]:bg-ia-bg/40';

export function EtapaCanal({
  r,
  alterar,
  erros,
  mostrarErros,
  operacao,
}: PropsEtapa & { operacao: NumeroOperacao }) {
  const [emDev, setEmDev] = useState(false);
  const erro = (k: string) => (mostrarErros ? erros[k] : undefined);
  const semNumero = !operacao.carregando && !operacao.numero;

  // Sem número na operação, a única saída é um número novo.
  useEffect(() => {
    if (semNumero && r.origemNumero === 'operacao') alterar({ origemNumero: 'novo' });
  }, [semNumero, r.origemNumero, alterar]);

  return (
    <div>
      <CabecalhoEtapa
        titulo="Canal"
        descricao="Por qual número de WhatsApp o agente atende e em quais horários ele responde."
      />

      <div className="space-y-6">
        <div>
          <span id="agente-numero-rotulo" className="mb-2 block text-sm font-semibold text-ink">
            Número do WhatsApp
          </span>
          <RadioGroup
            value={r.origemNumero}
            onValueChange={(v) => alterar({ origemNumero: v as OrigemNumero })}
            aria-labelledby="agente-numero-rotulo"
            className="gap-3"
          >
            <div className={cn(classeOpcao, semNumero ? 'border-line-subtle bg-canvas' : 'border-line')}>
              <div className="flex items-start gap-3">
                <RadioGroupItem
                  id="agente-origem-operacao"
                  value="operacao"
                  disabled={semNumero}
                  className="mt-0.5 cursor-pointer border-line-control"
                  aria-describedby="agente-origem-operacao-detalhe"
                />
                <label
                  htmlFor="agente-origem-operacao"
                  className={cn('min-w-0 flex-1', semNumero ? 'cursor-not-allowed' : 'cursor-pointer')}
                >
                  <span className={cn('block text-sm font-semibold', semNumero ? 'text-ink-3' : 'text-ink')}>
                    Usar o número da operação
                  </span>
                  <span
                    id="agente-origem-operacao-detalhe"
                    className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2"
                  >
                    {operacao.carregando ? (
                      <span className="text-ink-3">Consultando o número da operação</span>
                    ) : operacao.numero ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                          <Smartphone className="size-3.5 text-ink-3" aria-hidden />
                          <span className="tabular">{operacao.numero}</span>
                        </span>
                        {operacao.rotulo && <span className="text-ink-3">{operacao.rotulo}</span>}
                      </>
                    ) : operacao.erro ? (
                      <span className="text-ink-3">
                        Não foi possível consultar o número da operação. Use um número novo.
                      </span>
                    ) : (
                      <span className="text-ink-3">Nenhum número configurado</span>
                    )}
                  </span>
                </label>
              </div>
              <ErroCampo id="agente-numero-erro">{erro('numero')}</ErroCampo>
            </div>

            <div className={cn(classeOpcao, 'border-line')}>
              <div className="flex items-start gap-3">
                <RadioGroupItem
                  id="agente-origem-novo"
                  value="novo"
                  className="mt-0.5 cursor-pointer border-line-control"
                />
                <label htmlFor="agente-origem-novo" className="min-w-0 flex-1 cursor-pointer">
                  <span className="block text-sm font-semibold text-ink">Adicionar um novo número</span>
                  <span className="mt-1 block text-[13px] text-ink-3">
                    Um celular exclusivo para este agente.
                  </span>
                </label>
              </div>
              {r.origemNumero === 'novo' && (
                <div className="mt-4 pl-7">
                  <label htmlFor="agente-numero-novo" className="sr-only">
                    Novo número de WhatsApp
                  </label>
                  <div className="flex max-w-xs items-center gap-2">
                    <span
                      className="flex h-10 items-center rounded-control border border-line-control bg-chat px-3 text-sm font-semibold text-ink-2"
                      aria-hidden
                    >
                      +55
                    </span>
                    <Input
                      id="agente-numero-novo"
                      value={r.numeroNovo}
                      inputMode="tel"
                      autoComplete="off"
                      placeholder="(82) 99999-9999"
                      aria-invalid={!!erro('numeroNovo')}
                      aria-describedby={erro('numeroNovo') ? 'agente-numero-novo-erro' : undefined}
                      onChange={(e) => alterar({ numeroNovo: mascararCelular(e.target.value) })}
                      className={cn(classeInput, 'tabular')}
                    />
                  </div>
                  <ErroCampo id="agente-numero-novo-erro">{erro('numeroNovo')}</ErroCampo>
                </div>
              )}
            </div>
          </RadioGroup>
          <p className="mt-3 flex items-start gap-2 text-[13px] leading-[18px] text-ink-2">
            <Info className="mt-px size-3.5 shrink-0 text-ink-3" aria-hidden />
            No protótipo, o novo número não é conectado. Na implantação, cada agente usa um número na API
            oficial do WhatsApp.
          </p>
        </div>

        <Campo rotulo="Horário de atendimento" htmlFor="agente-horario" className="max-w-md">
          <Select
            value={r.horario}
            onValueChange={(v) => {
              // Personalizado ainda não existe: mostra o aviso e mantém o valor anterior.
              if (v === 'personalizado') return setEmDev(true);
              alterar({ horario: v as Horario });
            }}
          >
            <SelectTrigger id="agente-horario" size="lg" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HORARIOS.map((h) => (
                <SelectItem key={h.v} value={h.v}>
                  {h.t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Campo>
      </div>

      <EmDesenvolvimentoDialog
        aberto={emDev}
        onAbertoChange={setEmDev}
        recurso="Horário personalizado"
        detalhe="Na versão completa, você define dias e faixas de horário para cada agente. Neste protótipo, escolha 24 horas ou horário comercial."
      />
    </div>
  );
}
