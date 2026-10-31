import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const RATE_LIMIT_KEY = 'rate-limit';

export interface RateLimitOpts {
  limit: number;
  windowMs: number;
}

/**
 * `@RateLimit(limit, windowMs)` — limita tentativas por (IP + rota) numa janela deslizante.
 * Anti brute-force nas rotas públicas de auth (C1: login, definir-senha).
 */
export const RateLimit = (limit: number, windowMs: number) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowMs } satisfies RateLimitOpts);

interface ReqInfo {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  route?: { path?: string };
  url?: string;
  params?: { token?: unknown };
  body?: { email?: unknown; token?: unknown };
}

/**
 * Guard de rate-limit **in-memory** (janela deslizante). Suficiente para o deploy atual de
 * 1 instância web; multi-instância exigiria um store compartilhado (Redis) — ver roadmap C7.
 * Sem `@RateLimit` no handler, é no-op.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const opts = this.reflector.getAllAndOverride<RateLimitOpts | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!opts) return true;

    const req = context.switchToHttp().getRequest<ReqInfo>();
    // Chave = IP + rota + identificador do corpo (email/token). O identificador importa porque o
    // painel chama a API server-side (mesmo IP p/ todos): sem ele, um usuário limitaria os outros.
    const chave = `${this.clientIp(req)}:${req.route?.path ?? req.url ?? ''}:${this.idCorpo(req)}`;
    const agora = Date.now();
    const inicio = agora - opts.windowMs;

    const recentes = (this.hits.get(chave) ?? []).filter((t) => t > inicio);
    if (recentes.length >= opts.limit) {
      throw new HttpException(
        'Muitas tentativas. Aguarde alguns instantes e tente de novo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recentes.push(agora);
    this.hits.set(chave, recentes);
    if (this.hits.size > 5000) this.limpar(inicio); // limpeza oportunista (evita vazar memória)
    return true;
  }

  /**
   * Identificador p/ isolar a cota por conta/token — o painel chama a API server-side (mesmo IP
   * p/ todos), então sem isto um usuário limitaria os outros. Email (login), ou token do corpo
   * (definir-senha) OU da URL (formulário tokenizado — o token vem em `:token`, não no body).
   */
  private idCorpo(req: ReqInfo): string {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email) return `e:${email}`;
    const bodyToken = typeof req.body?.token === 'string' ? req.body.token : '';
    const paramToken = typeof req.params?.token === 'string' ? req.params.token : '';
    const token = bodyToken || paramToken;
    return token ? `t:${token.slice(0, 24)}` : '';
  }

  private clientIp(req: ReqInfo): string {
    const xff = req.headers['x-forwarded-for'];
    const doXff = Array.isArray(xff) ? xff[0] : typeof xff === 'string' ? xff.split(',')[0]?.trim() : undefined;
    return req.ip ?? doXff ?? req.socket?.remoteAddress ?? 'desconhecido';
  }

  private limpar(inicio: number): void {
    for (const [k, ts] of this.hits) {
      const filtrado = ts.filter((t) => t > inicio);
      if (filtrado.length === 0) this.hits.delete(k);
      else this.hits.set(k, filtrado);
    }
  }
}
