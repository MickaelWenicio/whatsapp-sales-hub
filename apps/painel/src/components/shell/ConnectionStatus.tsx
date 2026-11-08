'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNumeros } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { ehNumeroFicticio, type NumeroDTO } from '@sales-hub/shared';
import Link from 'next/link';

type Visual = { rotulo: string; ponto: string };

function visualDe(n: NumeroDTO | undefined, carregando: boolean): Visual {
  if (!n)
    return { rotulo: carregando ? 'Verificando' : 'Sem número', ponto: 'bg-line-control' };
  switch (n.estado) {
    case 'conectado':
      return { rotulo: 'Conectado', ponto: 'bg-hum-solid' };
    case 'reconectando':
      return { rotulo: 'Reconectando', ponto: 'bg-pau-solid' };
    case 'erro':
      return { rotulo: 'Falha na conexão', ponto: 'bg-emg-solid' };
    default:
      return { rotulo: 'Desconectado', ponto: 'bg-emg-solid' };
  }
}

export function ConnectionStatus() {
  const { data, isLoading, isError } = useNumeros();
  // Apenas números reais podem indicar que o WhatsApp está conectado.
  const reais = (data ?? []).filter((n) => !n.ficticio && !ehNumeroFicticio(n.e164));
  const lista = reais;
  const ordem = (n: NumeroDTO) =>
    n.estado === 'conectado' ? 0 : n.estado === 'reconectando' ? 1 : 2;
  const numero = [...lista].sort((a, b) => ordem(b) - ordem(a))[0];
  const v = isError
    ? { rotulo: 'Conexão indisponível', ponto: 'bg-emg-solid' }
    : visualDe(numero, isLoading);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href="/conexoes"
          aria-label={`WhatsApp: ${v.rotulo}. Abrir conexões`}
          className="flex h-9 items-center gap-2 rounded-control px-2 text-sm font-medium text-ink-2 hover:bg-chat focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className={cn('size-2.5 rounded-full', v.ponto)} aria-hidden="true" />
          <span className="hidden sm:inline">{v.rotulo}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        {numero ? (
          <div className="space-y-0.5">
            <div className="font-semibold">{numero.rotulo}</div>
            <div className="tabular">{numero.telefoneExibicao}</div>
            <div>Instância {numero.instancia}</div>
            {numero.estado !== 'conectado' && numero.ultimaFalha ? (
              <div>{numero.ultimaFalha}</div>
            ) : null}
          </div>
        ) : (
          <span>Nenhum número cadastrado. Cadastre em Conexões e equipe.</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
