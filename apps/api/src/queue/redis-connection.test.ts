import { describe, expect, it } from 'vitest';
import { parseRedisUrl } from './redis-connection';

describe('parseRedisUrl', () => {
  it('parseia redis local com defaults', () => {
    expect(parseRedisUrl('redis://localhost:6379')).toEqual({
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    });
  });

  it('parseia rediss com auth e porta custom (Upstash-style)', () => {
    const opts = parseRedisUrl('rediss://default:seg%40redo@fly-redis:6380');
    expect(opts).toMatchObject({
      host: 'fly-redis',
      port: 6380,
      password: 'seg@redo', // decodifica %40
      tls: {},
      maxRetriesPerRequest: null,
    });
    expect(opts.username).toBeUndefined(); // 'default' é omitido
  });

  it('usa 6379 quando a porta é omitida', () => {
    expect(parseRedisUrl('redis://cache').port).toBe(6379);
  });

  it('respeita o índice do banco no caminho (redis://host:porta/2)', () => {
    expect(parseRedisUrl('redis://localhost:6379/2').db).toBe(2);
    expect(parseRedisUrl('redis://localhost:6379/').db).toBeUndefined();
  });
});
