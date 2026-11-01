import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import type { PapelUsuario } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import { ActorGuard, RolesGuard } from './rbac';

const TOKEN = 'token-de-teste';

function ctx(headers: Record<string, string>, req: Record<string, unknown> = {}): ExecutionContext {
  const r = Object.assign(req, { headers });
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => r }),
  } as unknown as ExecutionContext;
}

function actorGuard(usuarios: { id: string; papel: PapelUsuario; ativo: boolean }[], token = TOKEN) {
  const prisma = {
    user: {
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; ativo: boolean } }) =>
          usuarios.find((u) => u.id === where.id && u.ativo === where.ativo) ?? null,
      ),
    },
  } as unknown as PrismaService;
  const config = { get: (k: string) => (k === 'ADMIN_API_TOKEN' ? token : undefined) } as unknown as ConfigService;
  return new ActorGuard(config, prisma);
}

describe('ActorGuard', () => {
  const users = [
    { id: 'u1', papel: 'atendente' as const, ativo: true },
    { id: 'u2', papel: 'dono' as const, ativo: false },
  ];

  it('rejeita com 401 quando x-actor-id não corresponde a usuário ativo', async () => {
    const g = actorGuard(users);
    await expect(g.canActivate(ctx({ 'x-admin-token': TOKEN, 'x-actor-id': 'inexistente' }))).rejects.toMatchObject({
      status: 401,
    });
    await expect(g.canActivate(ctx({ 'x-admin-token': TOKEN, 'x-actor-id': 'u2' }))).rejects.toMatchObject({
      status: 401,
    });
    await expect(g.canActivate(ctx({ 'x-admin-token': TOKEN }))).rejects.toMatchObject({ status: 401 });
  });

  it('rejeita com 401 sem x-admin-token válido', async () => {
    const g = actorGuard(users);
    await expect(g.canActivate(ctx({ 'x-actor-id': 'u1' }))).rejects.toMatchObject({ status: 401 });
    await expect(g.canActivate(ctx({ 'x-admin-token': 'errado', 'x-actor-id': 'u1' }))).rejects.toMatchObject({
      status: 401,
    });
  });

  it('não abre o modo dev quando ADMIN_API_TOKEN está vazio', async () => {
    const g = actorGuard(users, '');
    await expect(g.canActivate(ctx({ 'x-actor-id': 'u1' }))).rejects.toMatchObject({ status: 401 });
  });

  it('aceita usuário ativo e anexa req.actor = { id, papel }', async () => {
    const req: Record<string, unknown> = {};
    const g = actorGuard(users);
    expect(await g.canActivate(ctx({ 'x-admin-token': TOKEN, 'x-actor-id': 'u1' }, req))).toBe(true);
    expect(req.actor).toEqual({ id: 'u1', papel: 'atendente' });
  });
});

function rolesGuard(roles?: PapelUsuario[]): RolesGuard {
  return new RolesGuard({ getAllAndOverride: vi.fn().mockReturnValue(roles) } as unknown as Reflector);
}
const comAtor = (papel?: PapelUsuario) => ctx({}, { actor: papel ? { id: 'x', papel } : undefined });

describe('RolesGuard', () => {
  it('sem @Roles libera', () => {
    expect(rolesGuard(undefined).canActivate(comAtor('atendente'))).toBe(true);
  });
  it('dono passa em qualquer @Roles', () => {
    expect(rolesGuard(['gestor']).canActivate(comAtor('dono'))).toBe(true);
  });
  it('gestor passa quando está na lista', () => {
    expect(rolesGuard(['dono', 'gestor']).canActivate(comAtor('gestor'))).toBe(true);
  });
  it('atendente em rota @Roles("dono","gestor") → 403', () => {
    expect(() => rolesGuard(['dono', 'gestor']).canActivate(comAtor('atendente'))).toThrow(ForbiddenException);
  });
  it('sem identidade em rota com @Roles → 403', () => {
    expect(() => rolesGuard(['dono']).canActivate(comAtor())).toThrow(ForbiddenException);
  });
});
