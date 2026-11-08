import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '@/auth';
import { AppShell } from '@/components/shell/AppShell';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const sessao = await auth();
  if (!sessao?.user?.id) redirect('/login');

  const jar = await cookies();
  const preferenciaNav = jar.get('saleshub_nav')?.value === 'recolhida' ? 'recolhida' : 'aberta';

  return (
    <AppShell
      usuario={{
        nome: sessao.user.name ?? sessao.user.email ?? 'Usuário',
        email: sessao.user.email ?? '',
        papel: sessao.user.papel,
      }}
      preferenciaNav={preferenciaNav}
    >
      {children}
    </AppShell>
  );
}
