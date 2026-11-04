import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { parseRedisUrl } from '../../queue/redis-connection';
import { TurnoLockService } from './turno-lock.service';

const redis = new Redis(parseRedisUrl(process.env.REDIS_URL ?? 'redis://localhost:6379'));
const lock = new TurnoLockService(redis);
const ids: string[] = [];
const novo = () => {
  const id = `t8-${randomUUID()}`;
  ids.push(id);
  return id;
};

describe('TurnoLockService (Redis local)', () => {
  afterAll(async () => {
    await redis.del(...ids.flatMap((i) => [`saleshub:turno:${i}`, `saleshub:turno:visto:${i}`]));
    redis.disconnect();
  });

  it('só um adquire; liberar com o token permite adquirir de novo', async () => {
    const id = novo();
    const tok = await lock.adquirir(id);
    expect(tok).toEqual(expect.any(String));
    expect(await lock.adquirir(id)).toBeNull();
    await lock.liberar(id, tok!);
    expect(await lock.adquirir(id)).toEqual(expect.any(String));
  });

  it('liberar com token velho não apaga a trava de outro dono', async () => {
    const id = novo();
    const velho = (await lock.adquirir(id, 100))!;
    await new Promise((r) => setTimeout(r, 200)); // expirou
    const atual = (await lock.adquirir(id))!;
    await lock.liberar(id, velho);
    expect(await redis.get(`saleshub:turno:${id}`)).toBe(atual);
    expect(await lock.adquirir(id)).toBeNull();
  });

  it('renovar estende o TTL só para o dono', async () => {
    const id = novo();
    const tok = (await lock.adquirir(id, 1000))!;
    expect(await lock.renovar(id, tok, 60_000)).toBe(true);
    expect(await redis.pttl(`saleshub:turno:${id}`)).toBeGreaterThan(1000);
    expect(await lock.renovar(id, 'outro', 60_000)).toBe(false);
  });

  it('marcador de visto grava e lê', async () => {
    const id = novo();
    expect(await lock.lerVisto(id)).toBeNull();
    await lock.marcarVisto(id, 1234567890123);
    expect(await lock.lerVisto(id)).toBe(1234567890123);
  });

  it('usa a chave saleshub:turno:<id> com TTL', async () => {
    const id = novo();
    await lock.adquirir(id, 5000);
    const ttl = await redis.pttl(`saleshub:turno:${id}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5000);
  });

  it('a trava expira pelo TTL', async () => {
    const id = novo();
    expect(await lock.adquirir(id, 100)).not.toBeNull();
    await new Promise((r) => setTimeout(r, 200));
    expect(await lock.adquirir(id)).not.toBeNull();
  });

  it('adquirir concorrente: exatamente um vence', async () => {
    const id = novo();
    const r = await Promise.all(Array.from({ length: 10 }, () => lock.adquirir(id)));
    expect(r.filter(Boolean)).toHaveLength(1);
  });
});
