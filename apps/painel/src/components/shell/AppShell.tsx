'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEventosAoVivo } from '@/lib/use-eventos';
import { AppNav, ITENS_NAV } from './AppNav';
import { IaOffBanner } from './IaOffBanner';
import { TopBar } from './TopBar';

export function AppShell({
  usuario,
  preferenciaNav,
  children,
}: {
  usuario: { nome: string; email: string; papel: string };
  preferenciaNav: 'aberta' | 'recolhida';
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { conectado } = useEventosAoVivo();
  const titulo = ITENS_NAV.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`))?.titulo ?? '';

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <AppNav preferenciaInicial={preferenciaNav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar titulo={titulo} usuario={usuario} tempoRealOk={conectado} />
        <IaOffBanner papel={usuario.papel} />
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
