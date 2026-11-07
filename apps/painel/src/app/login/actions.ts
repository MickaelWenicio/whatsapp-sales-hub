'use server';

import { AuthError } from 'next-auth';
import { signIn } from '@/auth';

export type EstadoLogin = { erro?: string };

export async function entrar(_anterior: EstadoLogin, dados: FormData): Promise<EstadoLogin> {
  try {
    await signIn('credentials', {
      email: String(dados.get('email') ?? ''),
      senha: String(dados.get('senha') ?? ''),
      redirectTo: '/visao-geral',
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return { erro: 'E-mail ou senha incorretos. Confira os dados e tente de novo.' };
    }
    throw e; // o redirect de sucesso é uma exceção que o Next precisa receber
  }
  return {};
}
