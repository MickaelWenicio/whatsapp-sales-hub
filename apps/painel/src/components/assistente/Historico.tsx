'use client';

import { useId, useState } from 'react';
import { Ellipsis, Pencil, Search, SquarePen, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAcoesAssistente } from './contexto';
import { GRUPOS_HISTORICO, normalizar, type Conversa } from './respostas';

export function Historico({
  conversas,
  ativaId,
  onNova,
  onAbrir,
}: {
  conversas: Conversa[];
  ativaId: string | null;
  onNova: () => void;
  onAbrir: (id: string) => void;
}) {
  const [busca, setBusca] = useState('');
  const idBase = useId();
  const termo = normalizar(busca.trim());
  const filtradas = termo
    ? conversas.filter((c) => normalizar(c.titulo).includes(termo))
    : conversas;
  const grupos = GRUPOS_HISTORICO.map((g) => ({
    ...g,
    itens: filtradas.filter((c) => c.grupo === g.id),
  })).filter((g) => g.itens.length > 0);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="space-y-3 p-3">
        <Button size="lg" className="w-full justify-start gap-2 px-3" onClick={onNova}>
          <SquarePen strokeWidth={1.75} aria-hidden="true" />
          Nova conversa
        </Button>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <Input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar conversas"
            aria-label="Buscar conversas"
            className="h-9 bg-panel pl-9"
          />
        </div>
      </div>

      <nav
        aria-label="Histórico de conversas"
        className="funil-rolagem min-h-0 flex-1 overflow-y-auto px-3 pb-4"
      >
        {grupos.length === 0 ? (
          <p className="px-3 py-6 text-sm text-ink-3">
            Nenhuma conversa encontrada. Tente outra palavra.
          </p>
        ) : (
          grupos.map((g) => (
            <section key={g.id} aria-labelledby={`${idBase}-${g.id}`} className="mt-4 first:mt-1">
              <h3
                id={`${idBase}-${g.id}`}
                className="px-3 pb-1.5 font-sans text-xs leading-4 font-semibold text-ink-3"
              >
                {g.rotulo}
              </h3>
              <ul className="space-y-0.5">
                {g.itens.map((c) => (
                  <ItemHistorico
                    key={c.id}
                    conversa={c}
                    ativa={c.id === ativaId}
                    onAbrir={onAbrir}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </nav>
    </div>
  );
}

function ItemHistorico({
  conversa,
  ativa,
  onAbrir,
}: {
  conversa: Conversa;
  ativa: boolean;
  onAbrir: (id: string) => void;
}) {
  const { emDesenvolvimento } = useAcoesAssistente();
  const [menuAberto, setMenuAberto] = useState(false);
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onAbrir(conversa.id)}
        aria-current={ativa ? 'page' : undefined}
        className={cn(
          'relative flex h-9 w-full items-center rounded-control pr-10 pl-3 text-left text-sm text-ink-2 transition-colors duration-[120ms] outline-none group-hover:bg-chat group-hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50',
          (ativa || menuAberto) && 'bg-chat text-ink',
          ativa && 'bg-ia-bg font-semibold group-hover:bg-ia-bg',
        )}
      >
        {ativa ? (
          <span
            aria-hidden="true"
            className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-sinal"
          />
        ) : null}
        <span className="truncate">{conversa.titulo}</span>
      </button>
      <DropdownMenu modal={false} open={menuAberto} onOpenChange={setMenuAberto}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Mais opções para ${conversa.titulo}`}
            className={cn(
              'absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-chip text-ink-3 opacity-0 transition-opacity duration-[120ms] outline-none group-hover:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 [@media(pointer:coarse)]:opacity-100',
              (ativa || menuAberto) && 'opacity-100',
              menuAberto && 'bg-sunken text-ink',
            )}
          >
            <Ellipsis className="size-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem onSelect={() => emDesenvolvimento('Renomear conversas')}>
            <Pencil strokeWidth={1.75} aria-hidden="true" />
            Renomear
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => emDesenvolvimento('Excluir conversas')}
          >
            <Trash2 strokeWidth={1.75} aria-hidden="true" />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
