import 'server-only';
/**
 * Acesso server-side à API admin (NestJS).
 *
 * Usar SEMPRE no servidor (server components, server actions, route handlers). Envia
 * `x-admin-token` (nunca vai ao browser) e SEMPRE o ator (`x-actor-id`): sem ator a API recusa.
 * Se o chamador não passa o ator, ele vem da sessão.
 */
import { auth } from '@/auth';

const ADMIN_API_URL = process.env.ADMIN_API_URL ?? 'http://localhost:3311';
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN ?? '';

export type Ator = { id: string; email?: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public corpo?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function urlAdmin(caminho: string): string {
  return `${ADMIN_API_URL}/admin/${caminho.replace(/^\/+/, '').replace(/^admin\//, '')}`;
}

export async function atorDaSessao(): Promise<Ator> {
  const sessao = await auth();
  if (!sessao?.user?.id) throw new ApiError(401, 'Sessão expirada. Entre de novo.');
  return { id: sessao.user.id, email: sessao.user.email ?? undefined };
}

export function cabecalhosAdmin(ator: Ator, extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  h.set('x-admin-token', ADMIN_API_TOKEN);
  h.set('x-actor-id', ator.id);
  if (ator.email) h.set('x-actor-email', ator.email);
  return h;
}

/** Chamada bruta: devolve a Response sem interpretar o corpo (usada pelo BFF e pelo stream). */
export async function adminResponse(
  caminho: string,
  init: RequestInit = {},
  ator?: Ator,
): Promise<Response> {
  const quem = ator ?? (await atorDaSessao());
  const headers = cabecalhosAdmin(quem, init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetch(urlAdmin(caminho), { ...init, headers, cache: 'no-store' });
}

/** `caminho` é relativo a `/admin` (ex.: `visao-geral?periodo=7`). */
export async function adminFetch<T>(caminho: string, init?: RequestInit, ator?: Ator): Promise<T> {
  const res = await adminResponse(caminho, init, ator);
  if (res.status === 204) return undefined as T;
  const texto = await res.text();
  let corpo: unknown;
  try {
    corpo = texto ? JSON.parse(texto) : undefined;
  } catch {
    corpo = texto;
  }
  if (!res.ok) {
    const msg =
      corpo && typeof corpo === 'object' && 'message' in corpo
        ? String((corpo as { message: unknown }).message)
        : `Erro ${res.status} na API`;
    throw new ApiError(res.status, msg, corpo);
  }
  return corpo as T;
}
