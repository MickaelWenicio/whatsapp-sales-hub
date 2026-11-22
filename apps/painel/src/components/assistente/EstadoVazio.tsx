'use client';

import { useAcoesAssistente } from './contexto';
import { AvatarAssistente } from './Mensagem';
import { SUGESTOES_INICIAIS } from './respostas';

/** Saudação centralizada e quatro atalhos para começar uma conversa. */
export function EstadoVazio({
  saudacao,
  primeiroNome,
}: {
  saudacao: string;
  primeiroNome: string;
}) {
  const { enviar, ocupado } = useAcoesAssistente();
  return (
    <div className="@container mx-auto flex min-h-full w-full max-w-[760px] flex-col justify-center px-4 py-10 sm:px-6">
      <div className="mb-8 flex flex-col items-center text-center">
        <AvatarAssistente className="mb-5 size-11 [&_svg]:size-5" />
        <h2 className="font-display text-[28px] leading-[34px] font-bold tracking-[-0.02em] text-ink">
          {saudacao}
          {primeiroNome ? `, ${primeiroNome}` : ''}.
          <span className="mt-1 block text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink-2">
            Como posso ajudar na operação hoje?
          </span>
        </h2>
      </div>
      <ul className="grid gap-3 @lg:grid-cols-2" aria-label="Sugestões para começar">
        {SUGESTOES_INICIAIS.map(({ titulo, descricao, icone: Icone, mensagem }) => (
          <li key={titulo}>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => enviar(mensagem)}
              className="flex h-full w-full items-start gap-3 rounded-card border border-line bg-panel p-4 text-left transition-colors duration-[120ms] outline-none hover:border-ia-border hover:bg-ia-bg/40 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-control bg-ia-bg text-sinal-forte">
                <Icone className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm leading-5 font-bold text-ink">{titulo}</span>
                <span className="mt-0.5 block text-[13px] leading-[18px] font-medium text-ink-3">
                  {descricao}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
