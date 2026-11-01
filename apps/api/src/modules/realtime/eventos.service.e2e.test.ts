import type { ConfigService } from '@nestjs/config';
import type { EventoTempoReal } from '@sales-hub/shared';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRedisUrl } from '../../queue/redis-connection';
import { EventosService } from './eventos.service';

const PREFIXO = 'saleshub:test:';

describe('EventosService (Redis local)', () => {
  let redis: Redis;
  let servico: EventosService;

  beforeAll(() => {
    redis = new Redis(parseRedisUrl(process.env.REDIS_URL ?? 'redis://localhost:6379'));
    const config = { get: (k: string) => (k === 'EVENTOS_PREFIX' ? PREFIXO : undefined) } as unknown as ConfigService;
    servico = new EventosService(redis, config);
  });

  beforeEach(async () => {
    const chaves = await redis.keys(`${PREFIXO}*`);
    if (chaves.length) await redis.del(...chaves);
  });

  afterAll(async () => {
    const chaves = await redis.keys(`${PREFIXO}*`);
    if (chaves.length) await redis.del(...chaves);
    redis.disconnect();
  });

  it('assinante recebe evento publicado com id crescente', async () => {
    const recebidos: EventoTempoReal[] = [];
    const parar = await servico.assinar((e) => recebidos.push(e));
    await servico.publicar('agent.typing', { conversationId: 'c1', ativo: true });
    await servico.publicar('agent.typing', { conversationId: 'c1', ativo: false });
    await vi.waitFor(() => expect(recebidos).toHaveLength(2));
    expect(Number(recebidos[0].id)).toBeGreaterThan(0);
    expect(Number(recebidos[1].id)).toBeGreaterThan(Number(recebidos[0].id));
    expect(recebidos[0].tipo).toBe('agent.typing');
    await parar();
  });

  it('replay devolve eventos após Last-Event-ID', async () => {
    await servico.publicar('settings.updated', { chave: 'a' });
    await servico.publicar('settings.updated', { chave: 'b' });
    await servico.publicar('settings.updated', { chave: 'c' });
    const todos = await servico.replay('0');
    expect(todos.map((e) => e.payload)).toEqual([{ chave: 'a' }, { chave: 'b' }, { chave: 'c' }]);
    const depois = await servico.replay(todos[0].id);
    expect(depois.map((e) => e.payload)).toEqual([{ chave: 'b' }, { chave: 'c' }]);
  });

  it('mantém só os últimos 500 eventos no buffer', async () => {
    for (let i = 0; i < 505; i++) await servico.publicar('task.updated', { taskId: String(i) });
    const todos = await servico.replay('0');
    expect(todos).toHaveLength(500);
    expect(todos[499].payload).toEqual({ taskId: '504' });
  });

  it('publicações concorrentes têm ids na mesma ordem do buffer e do canal', async () => {
    const recebidos: EventoTempoReal[] = [];
    const parar = await servico.assinar((e) => recebidos.push(e));
    await Promise.all(Array.from({ length: 50 }, (_, i) => servico.publicar('task.updated', { taskId: String(i) })));
    await vi.waitFor(() => expect(recebidos).toHaveLength(50));
    const ids = recebidos.map((e) => Number(e.id));
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect((await servico.replay('0')).map((e) => e.id)).toEqual(recebidos.map((e) => e.id));
    await parar();
  });

  it('assinar com desdeId e publicações durante o replay: sem duplicata e sem perda', async () => {
    for (let i = 0; i < 5; i++) await servico.publicar('task.updated', { taskId: `a${i}` });
    const base = (await servico.replay('0'))[0].id;
    const original = servico.replay.bind(servico);
    let disparou: Promise<void> | undefined;
    servico.replay = async (desde: string) => {
      const r = await original(desde);
      disparou = (async () => {
        for (let i = 0; i < 3; i++) await servico.publicar('task.updated', { taskId: `b${i}` });
      })();
      await disparou;
      return r;
    };
    const recebidos: EventoTempoReal[] = [];
    try {
      const parar = await servico.assinar((e) => recebidos.push(e), base);
      await vi.waitFor(() => expect(recebidos).toHaveLength(7));
      await new Promise((r) => setTimeout(r, 100));
      await parar();
    } finally {
      servico.replay = original;
    }
    expect(recebidos.map((e) => (e.payload as { taskId: string }).taskId)).toEqual([
      'a1', 'a2', 'a3', 'a4', 'b0', 'b1', 'b2',
    ]);
  });

  it('assinar libera a conexão duplicada quando falha', async () => {
    const original = servico.replay.bind(servico);
    servico.replay = async () => {
      throw new Error('boom');
    };
    const antes = (await redis.client('LIST')) as string;
    const contar = (t: string) => t.split(/\r?\n/).filter((l) => l.includes('flags=P')).length;
    await expect(servico.assinar(() => undefined, '0')).rejects.toThrow('boom');
    servico.replay = original;
    await new Promise((r) => setTimeout(r, 100));
    const depois = (await redis.client('LIST')) as string;
    expect(contar(depois)).toBeLessThanOrEqual(contar(antes));
  });
});
