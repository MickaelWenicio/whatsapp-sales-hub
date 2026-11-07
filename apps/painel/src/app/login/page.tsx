import Image from 'next/image';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10"
      style={{ background: 'linear-gradient(140deg, var(--noite-profunda), var(--noite-suave))' }}
    >
      <Image
        src="/brand/logo.svg"
        alt="Central Comercial"
        width={64}
        height={64}
        priority
        unoptimized
        className="size-16"
      />
      <section className="w-full max-w-sm rounded-panel bg-panel p-8 shadow-e2">
        <h1 className="font-display text-[22px] leading-7 font-semibold tracking-[-0.015em] text-ink">
          Central Comercial
        </h1>
        <p className="mt-1 text-sm text-ink-2">Entre com seu e-mail e sua senha.</p>
        <LoginForm />
      </section>
      <p className="text-xs text-nav-muted">Acesso restrito à equipe.</p>
    </main>
  );
}
