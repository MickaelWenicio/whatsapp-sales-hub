'use client';

import { ChevronDown, LogOut } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { iniciais } from '@/lib/formatos';
import { sair } from '@/app/(app)/actions';
import { ConnectionStatus } from './ConnectionStatus';
import { KillSwitch } from './KillSwitch';

const ROTULO_PAPEL: Record<string, string> = {
  dono: 'Dono',
  gestor: 'Gestor',
  atendente: 'Atendente',
};

export function TopBar({
  titulo,
  usuario,
  tempoRealOk,
}: {
  titulo: string;
  usuario: { nome: string; email: string; papel: string };
  tempoRealOk: boolean;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 sm:gap-4 sm:px-6">
      <h1 className="min-w-0 flex-1 truncate font-display text-base leading-7 font-semibold tracking-[-0.015em] text-ink md:text-[22px]">
        {titulo}
      </h1>
      {!tempoRealOk ? (
        <span
          role="status"
          className="hidden rounded-chip bg-pau-bg px-2 py-1 text-xs font-semibold text-pau-fg lg:inline"
        >
          Reconectando ao tempo real
        </span>
      ) : null}
      <div className="hidden md:block">
        <KillSwitch papel={usuario.papel} />
      </div>
      <ConnectionStatus />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-9 items-center gap-2 rounded-full pr-2 pl-1 hover:bg-chat focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            aria-label="Menu do usuário"
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-sunken text-xs font-semibold text-[#374151]">
                {iniciais(usuario.nome)}
              </AvatarFallback>
            </Avatar>
            <ChevronDown className="size-4 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="space-y-0.5">
            <div className="text-sm font-bold text-ink">{usuario.nome}</div>
            <div className="text-xs font-medium text-ink-3">{usuario.email}</div>
            <div className="text-xs font-medium text-ink-3">
              {ROTULO_PAPEL[usuario.papel] ?? usuario.papel}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void sair()}>
            <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
