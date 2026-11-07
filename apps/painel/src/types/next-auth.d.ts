import type { DefaultSession } from 'next-auth';
import type { PapelUsuario } from '@sales-hub/shared';

/**
 * Além do `id` (enviado como `x-actor-id`), a sessão carrega o `papel` para o painel
 * esconder ações restritas (a API é quem de fato bloqueia).
 */
declare module 'next-auth' {
  interface Session {
    user: { id: string; papel: PapelUsuario } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    papel?: PapelUsuario;
  }
}
