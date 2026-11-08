'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Bot,
  Columns3,
  FileText,
  LayoutDashboard,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  RotateCcw,
  Sparkles,
  UsersRound,
  Workflow,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNaoLidas } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const ITENS_NAV = [
  { href: '/visao-geral', rotulo: 'Visão geral', titulo: 'Visão geral', Icone: LayoutDashboard },
  { href: '/assistente', rotulo: 'Assistente', titulo: 'Assistente', Icone: Sparkles },
  { href: '/atendimento', rotulo: 'Atendimento', titulo: 'Atendimento', Icone: MessagesSquare },
  { href: '/contatos', rotulo: 'Contatos', titulo: 'Contatos', Icone: UsersRound },
  { href: '/funil', rotulo: 'Funil', titulo: 'Funil', Icone: Columns3 },
  { href: '/propostas', rotulo: 'Propostas', titulo: 'Propostas', Icone: FileText },
  { href: '/recuperacao', rotulo: 'Recuperação', titulo: 'Recuperação de leads', Icone: RotateCcw },
  { href: '/automacoes', rotulo: 'Automações', titulo: 'Automações', Icone: Workflow },
  { href: '/agente', rotulo: 'Agente de IA', titulo: 'Agente de IA', Icone: Bot },
  { href: '/conexoes', rotulo: 'Conexões e equipe', titulo: 'Conexões e equipe', Icone: Plug },
] as const;

const COOKIE = 'saleshub_nav';
const EMPRESA_NOME = process.env.NEXT_PUBLIC_EMPRESA_NOME ?? 'Empresa Exemplo';

function gravarPreferencia(recolhida: boolean) {
  document.cookie = `${COOKIE}=${recolhida ? 'recolhida' : 'aberta'}; path=/; max-age=31536000; samesite=lax`;
}

export function AppNav({ preferenciaInicial }: { preferenciaInicial: 'aberta' | 'recolhida' }) {
  const pathname = usePathname();
  const emAtendimento = pathname.startsWith('/atendimento');
  const [preferencia, setPreferencia] = useState(preferenciaInicial);
  // Em /atendimento a navegação abre recolhida; o botão ali vale só enquanto durar a tela.
  const [sobrescrita, setSobrescrita] = useState<boolean | null>(null);
  useEffect(() => setSobrescrita(null), [emAtendimento]);

  const recolhida = emAtendimento ? (sobrescrita ?? true) : preferencia === 'recolhida';
  const { data: naoLidas } = useNaoLidas();

  function alternar() {
    if (emAtendimento) {
      setSobrescrita(!recolhida);
      return;
    }
    const proxima = !recolhida;
    setPreferencia(proxima ? 'recolhida' : 'aberta');
    gravarPreferencia(proxima);
  }

  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        'flex shrink-0 flex-col bg-noite text-nav-text transition-[width] duration-[220ms] ease-standard',
        recolhida ? 'w-[72px]' : 'w-[72px] md:w-[232px]',
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center gap-3 border-b border-noite-suave',
          recolhida ? 'justify-center' : 'justify-center md:justify-start md:px-5',
        )}
      >
        <Image
          src="/brand/logo.svg"
          alt=""
          width={32}
          height={32}
          className="size-8 shrink-0"
          priority
          unoptimized
        />
        {!recolhida ? (
          <span className="hidden min-w-0 flex-col md:flex">
            <span className="truncate font-display text-[15px] leading-5 font-semibold tracking-[-0.01em] text-white">
              Central Comercial
            </span>
            <span className="truncate text-xs leading-4 text-nav-muted">{EMPRESA_NOME}</span>
          </span>
        ) : null}
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
        {ITENS_NAV.map(({ href, rotulo, Icone }) => {
          const ativo = pathname === href || pathname.startsWith(`${href}/`);
          const contador = href === '/atendimento' && naoLidas ? naoLidas : 0;
          const link = (
            <Link
              href={href}
              aria-current={ativo ? 'page' : undefined}
              className={cn(
                'relative flex h-10 items-center gap-3 rounded-control text-sm font-medium transition-colors duration-[120ms] hover:bg-noite-suave/60 hover:text-white focus-visible:ring-3 focus-visible:ring-ceu focus-visible:outline-none',
                recolhida ? 'justify-center' : 'justify-center md:justify-start md:px-3',
                ativo && 'bg-noite-suave font-semibold text-white',
              )}
            >
              {ativo ? (
                <span
                  className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-ceu"
                  aria-hidden="true"
                />
              ) : null}
              <Icone className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {!recolhida ? (
                <span className="sr-only md:not-sr-only md:flex-1 md:truncate">{rotulo}</span>
              ) : (
                <span className="sr-only">{rotulo}</span>
              )}
              {contador > 0 ? (
                <span
                  className={cn(
                    'tabular rounded-full bg-sinal text-center text-xs font-semibold text-white',
                    recolhida
                      ? 'absolute top-0.5 right-1.5 min-w-4 px-1 text-[11px] leading-4'
                      : 'min-w-5 px-1.5 leading-5',
                  )}
                  aria-label={`${contador} ${contador === 1 ? 'conversa não lida' : 'conversas não lidas'}`}
                >
                  {contador}
                </span>
              ) : null}
            </Link>
          );
          return (
            <li key={href}>
              {recolhida ? (
                <Tooltip>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{rotulo}</TooltipContent>
                </Tooltip>
              ) : (
                link
              )}
            </li>
          );
        })}
      </ul>

      <div className="border-t border-noite-suave p-3">
        {!recolhida ? (
          <div className="mb-3 hidden rounded-control border border-nav-muted/20 px-3 py-2 md:block">
            <div className="text-xs font-semibold text-nav-text">Central comercial</div>
            <div className="mt-0.5 text-xs text-nav-muted">Ambiente de demonstração</div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={alternar}
          aria-label={recolhida ? 'Expandir navegação' : 'Recolher navegação'}
          className={cn(
            'hidden h-10 w-full items-center gap-3 rounded-control text-sm font-medium text-nav-muted hover:bg-noite-suave/60 hover:text-white focus-visible:ring-3 focus-visible:ring-ceu focus-visible:outline-none md:flex',
            recolhida ? 'justify-center' : 'px-3',
          )}
        >
          {recolhida ? (
            <PanelLeftOpen className="size-5" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose className="size-5" strokeWidth={1.75} aria-hidden="true" />
              Recolher
            </>
          )}
        </button>
      </div>
    </nav>
  );
}
