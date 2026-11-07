'use client';

import { useActionState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmDesenvolvimento } from '@/components/ui/em-desenvolvimento';
import { Input } from '@/components/ui/input';
import { entrar, type EstadoLogin } from './actions';

export function LoginForm() {
  const [estado, acao, pendente] = useActionState<EstadoLogin, FormData>(entrar, {});

  return (
    <form action={acao} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-semibold text-ink">
          E-mail
        </label>
        <Input id="email" name="email" type="email" autoComplete="username" required className="h-10" />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="senha" className="text-sm font-semibold text-ink">
            Senha
          </label>
          <EmDesenvolvimento
            recurso="Recuperar senha"
            detalhe="A redefinição de senha por e-mail faz parte da implantação completa. Neste protótipo, peça um novo acesso ao gestor da conta."
          >
            {(abrir) => (
              <button
                type="button"
                onClick={abrir}
                className="rounded-chip text-xs font-semibold text-sinal hover:text-sinal-forte hover:underline focus-visible:ring-2 focus-visible:ring-sinal focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                Esqueci minha senha
              </button>
            )}
          </EmDesenvolvimento>
        </div>
        <Input id="senha" name="senha" type="password" autoComplete="current-password" required className="h-10" />
      </div>
      {estado.erro ? (
        <p role="alert" className="rounded-control border border-emg-border bg-emg-bg px-3 py-2 text-sm text-emg-fg">
          {estado.erro}
        </p>
      ) : null}
      <Button type="submit" className="h-10 w-full" disabled={pendente}>
        {pendente ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden />
            Entrando…
          </>
        ) : (
          'Entrar'
        )}
      </Button>
    </form>
  );
}
