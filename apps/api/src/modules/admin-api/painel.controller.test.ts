import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { PainelController } from './painel.controller';
import { ActorGuard, RolesGuard } from './rbac';

describe('PainelController authorization boundaries', () => {
  it('protects every dashboard endpoint with authenticated actors and roles', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, PainelController);
    expect(Array.isArray(guards)).toBe(true);
    expect(guards).toEqual(expect.arrayContaining([ActorGuard, RolesGuard]));
  });
  it.each([
    'qr',
    'reiniciarNumero',
    'desconectarNumero',
    'definirIaGlobal',
    'definirPermitidos',
    'simular',
    'reiniciarDemo',
  ])('denies attendants access to privileged %s action', (method) => {
    const guard = new RolesGuard(new Reflector());
    const context: any = {
      getClass: () => PainelController,
      getHandler: () => (PainelController.prototype as any)[method],
      switchToHttp: () => ({ getRequest: () => ({ actor: { id: 'u1', papel: 'atendente' } }) }),
    };
    expect(() => guard.canActivate(context)).toThrowError();
  });
});
