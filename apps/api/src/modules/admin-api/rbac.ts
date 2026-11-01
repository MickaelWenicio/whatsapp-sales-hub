import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { PapelUsuario } from '@prisma/client';
import { compararSegredo } from '../../common/compare-secret';
import { PrismaService } from '../../prisma/prisma.service';

/** Operador autenticado, resolvido pelo ActorGuard a partir de x-actor-id. */
export interface ActorPainel {
  id: string;
  papel: PapelUsuario;
}

interface ReqComActor {
  headers: Record<string, string | string[] | undefined>;
  actor?: ActorPainel;
}

const primeiro = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export const ROLES_KEY = 'rbac:roles';
export const Roles = (...papeis: PapelUsuario[]) => SetMetadata(ROLES_KEY, papeis);

/** Injeta o operador autenticado no controller. */
export const Actor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActorPainel | undefined =>
    ctx.switchToHttp().getRequest<ReqComActor>().actor,
);

/**
 * Autentica a chamada do painel: valida o ADMIN_API_TOKEN (x-admin-token ou Bearer) em tempo
 * constante e resolve o usuário ATIVO de `x-actor-id`. Sem token válido ou sem usuário ativo: 401.
 * O papel é sempre o do banco. Não há fallback nem modo aberto.
 */
@Injectable()
export class ActorGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ReqComActor>();
    const esperado = this.config.get<string>('ADMIN_API_TOKEN') ?? '';
    const auth = req.headers['authorization'];
    const fornecido =
      primeiro(req.headers['x-admin-token']) ??
      (typeof auth === 'string' ? auth.replace(/^Bearer\s+/i, '') : undefined);
    if (!esperado || !compararSegredo(fornecido, esperado)) {
      throw new UnauthorizedException('token admin inválido');
    }

    const actorId = primeiro(req.headers['x-actor-id']);
    const usuario = actorId
      ? await this.prisma.user.findFirst({
          where: { id: actorId, ativo: true },
          select: { id: true, papel: true },
        })
      : null;
    if (!usuario) throw new UnauthorizedException('usuário inválido ou inativo');

    req.actor = { id: usuario.id, papel: usuario.papel };
    return true;
  }
}

/** Gate por papel via `@Roles(...)`; sem `@Roles` libera. `dono` é superconjunto. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const papeis = this.reflector.getAllAndOverride<PapelUsuario[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!papeis || papeis.length === 0) return true;
    const actor = context.switchToHttp().getRequest<ReqComActor>().actor;
    if (!actor) throw new ForbiddenException('sem identidade para checagem de papel');
    if (!(actor.papel === 'dono' || papeis.includes(actor.papel))) {
      throw new ForbiddenException('papel sem permissão para esta ação');
    }
    return true;
  }
}
