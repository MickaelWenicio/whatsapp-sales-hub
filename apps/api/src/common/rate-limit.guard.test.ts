import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RateLimitGuard, type RateLimitOpts } from './rate-limit.guard';

function ctx(ip: string, email?: string): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ ip, headers: {}, route: { path: '/login' }, body: email ? { email } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

function guard(opts: RateLimitOpts | undefined): RateLimitGuard {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(opts) } as unknown as Reflector;
  return new RateLimitGuard(reflector);
}

describe('RateLimitGuard', () => {
  it('sem @RateLimit é no-op', () => {
    expect(guard(undefined).canActivate(ctx('1.1.1.1'))).toBe(true);
  });

  it('bloqueia após exceder o limite na janela', () => {
    const g = guard({ limit: 3, windowMs: 60_000 });
    const c = ctx('2.2.2.2');
    expect(g.canActivate(c)).toBe(true);
    expect(g.canActivate(c)).toBe(true);
    expect(g.canActivate(c)).toBe(true);
    expect(() => g.canActivate(c)).toThrow(HttpException);
  });

  it('IPs diferentes têm cotas separadas', () => {
    const g = guard({ limit: 1, windowMs: 60_000 });
    expect(g.canActivate(ctx('3.3.3.3'))).toBe(true);
    expect(g.canActivate(ctx('4.4.4.4'))).toBe(true); // outro IP → cota própria
    expect(() => g.canActivate(ctx('3.3.3.3'))).toThrow(); // mesmo IP → estourou
  });

  it('mesmo IP, e-mails diferentes → cotas separadas (painel chama a API server-side)', () => {
    const g = guard({ limit: 1, windowMs: 60_000 });
    expect(g.canActivate(ctx('9.9.9.9', 'a@x.dev'))).toBe(true);
    expect(g.canActivate(ctx('9.9.9.9', 'b@x.dev'))).toBe(true); // outra conta → cota própria
    expect(() => g.canActivate(ctx('9.9.9.9', 'a@x.dev'))).toThrow(); // mesma conta → estourou
  });
});
