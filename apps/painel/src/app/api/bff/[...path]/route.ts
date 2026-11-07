/**
 * BFF: o browser chama `/api/bff/<caminho>` e este handler repassa para
 * `${ADMIN_API_URL}/admin/<caminho>` com o token de serviço e o ator da sessão.
 * Sessão obrigatória (401), só prefixos permitidos (404) e só GET, POST e PUT.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/auth';
import { adminResponse } from '@/lib/api-server';

export const dynamic = 'force-dynamic';

const PREFIXOS_PERMITIDOS = new Set([
  'conversas',
  'mensagens',
  'oportunidades',
  'visao-geral',
  'ia-global',
  'numeros',
  'numero-operacao',
  'recuperacao',
  'catalogo',
  'demo',
  'equipe',
]);

type Ctx = { params: Promise<{ path: string[] }> };

async function repassar(req: NextRequest, ctx: Ctx): Promise<Response> {
  const sessao = await auth();
  if (!sessao?.user?.id) {
    return NextResponse.json({ message: 'Sessão expirada. Entre de novo.' }, { status: 401 });
  }

  const { path } = await ctx.params;
  let segmentos: string[];
  try {
    segmentos = path.map((s) => decodeURIComponent(s));
  } catch {
    return NextResponse.json({ message: 'Recurso não encontrado.' }, { status: 404 });
  }
  if (
    segmentos.length === 0 ||
    segmentos.some(
      (s) => s === '' || s === '.' || s === '..' || s.includes('/') || s.includes('\\'),
    ) ||
    !PREFIXOS_PERMITIDOS.has(segmentos[0])
  ) {
    return NextResponse.json({ message: 'Recurso não encontrado.' }, { status: 404 });
  }

  const caminho = segmentos.map(encodeURIComponent).join('/') + req.nextUrl.search;
  const comCorpo = req.method !== 'GET';
  const corpo = comCorpo ? await req.text() : undefined;

  let upstream: Response;
  try {
    upstream = await adminResponse(
      caminho,
      { method: req.method, body: corpo ? corpo : undefined },
      { id: sessao.user.id, email: sessao.user.email ?? undefined },
    );
  } catch {
    return NextResponse.json(
      { message: 'Não foi possível falar com a API. Tente de novo em instantes.' },
      { status: 502 },
    );
  }

  if (upstream.status === 204) return new Response(null, { status: 204 });
  const headers = new Headers();
  headers.set('content-type', upstream.headers.get('content-type') ?? 'application/json');
  headers.set('cache-control', 'no-store');
  return new Response(await upstream.arrayBuffer(), { status: upstream.status, headers });
}

export const GET = repassar;
export const POST = repassar;
export const PUT = repassar;
