/**
 * Proxy SSE: autentica a sessão, abre `${ADMIN_API_URL}/admin/events` com token e ator,
 * repassa `Last-Event-ID` e devolve o corpo como `text/event-stream`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { adminResponse } from '@/lib/api-server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<Response> {
  const sessao = await auth();
  if (!sessao?.user?.id) {
    return NextResponse.json({ message: 'Sessão expirada. Entre de novo.' }, { status: 401 });
  }

  const headers: Record<string, string> = { accept: 'text/event-stream' };
  const ultimoId = req.headers.get('last-event-id');
  if (ultimoId) headers['last-event-id'] = ultimoId;

  let upstream: Response;
  try {
    upstream = await adminResponse(
      'events',
      { method: 'GET', headers, signal: req.signal },
      { id: sessao.user.id, email: sessao.user.email ?? undefined },
    );
  } catch (e) {
    // sessão ausente/expirada (atorDaSessao) vira 401; o resto é falha de rede com a API
    const status = (e as { status?: number })?.status === 401 ? 401 : 502;
    return NextResponse.json(
      { message: status === 401 ? 'Sessão expirada. Entre de novo.' : 'Tempo real indisponível.' },
      { status },
    );
  }

  if (upstream.status === 401 || upstream.status === 403) {
    await upstream.body?.cancel().catch(() => undefined);
    return NextResponse.json(
      { message: 'Sessão sem acesso ao tempo real. Entre de novo.' },
      { status: upstream.status },
    );
  }
  if (!upstream.ok || !upstream.body) {
    await upstream.body?.cancel().catch(() => undefined);
    return NextResponse.json({ message: 'Tempo real indisponível.' }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
