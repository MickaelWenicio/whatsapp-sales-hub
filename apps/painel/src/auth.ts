/**
 * Auth.js (NextAuth v5) do painel.
 *
 * Camada de sessão do operador no browser, separada do token server a server
 * (`x-admin-token`) usado por `src/lib/api-server.ts`. O `authorize()` faz um POST no servidor
 * em `${ADMIN_API_URL}/admin/auth/login`; nenhum segredo vai ao browser.
 */
import NextAuth, { type NextAuthResult } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { NextResponse } from 'next/server';
import type { PapelUsuario } from '@sales-hub/shared';

// Lista local (só tipo vindo do shared): o middleware roda no edge e não deve puxar o pacote inteiro.
const PAPEIS: readonly PapelUsuario[] = ['dono', 'gestor', 'atendente'];

const ADMIN_API_URL = process.env.ADMIN_API_URL ?? 'http://localhost:3311';

type PainelUser = {
  id: string;
  name: string | null;
  email: string | null;
  papel: PapelUsuario;
};

/** 200 devolve o usuário; qualquer outra resposta (401, 5xx, API fora do ar) nega o acesso. */
async function login(email: string, senha: string): Promise<PainelUser | null> {
  try {
    const res = await fetch(`${ADMIN_API_URL}/admin/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, senha }),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      id?: string;
      nome?: string;
      email?: string;
      papel?: string;
    };
    if (!data.id) return null;
    const papel = PAPEIS.find((p) => p === data.papel);
    if (!papel) return null;
    return { id: data.id, name: data.nome ?? null, email: data.email ?? email, papel };
  } catch {
    return null;
  }
}

const nextAuth = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'E-mail', type: 'email' },
        senha: { label: 'Senha', type: 'password' },
      },
      authorize: async (credentials) => {
        const email = typeof credentials?.email === 'string' ? credentials.email.trim() : '';
        const senha = typeof credentials?.senha === 'string' ? credentials.senha : '';
        if (!email || !senha) return null;
        return login(email, senha);
      },
    }),
  ],
  callbacks: {
    /** Gate de rota (roda no middleware). */
    authorized({ auth: session, request }) {
      const logado = !!session?.user;
      const { pathname } = request.nextUrl;
      if (pathname === '/login') {
        if (logado) return NextResponse.redirect(new URL('/visao-geral', request.nextUrl));
        return true;
      }
      return logado;
    },
    jwt({ token, user }) {
      if (user) token.papel = (user as { papel?: PapelUsuario }).papel;
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.sub === 'string') session.user.id = token.sub;
      // papel mais restrito como reserva, caso o token seja antigo
      if (session.user) session.user.papel = (token.papel as PapelUsuario | undefined) ?? 'atendente';
      return session;
    },
  },
});

// Anotações explícitas evitam o TS2742 (portabilidade) do next-auth v5 beta.
export const handlers: NextAuthResult['handlers'] = nextAuth.handlers;
export const auth: NextAuthResult['auth'] = nextAuth.auth;
export const signIn: NextAuthResult['signIn'] = nextAuth.signIn;
export const signOut: NextAuthResult['signOut'] = nextAuth.signOut;
