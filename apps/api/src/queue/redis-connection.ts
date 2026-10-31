/** Opções de conexão do ioredis usadas pelo BullMQ (workers exigem maxRetriesPerRequest=null). */
export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
  db?: number;
  maxRetriesPerRequest: null;
}

/** Converte uma REDIS_URL (`redis://` / `rediss://`) nas opções do ioredis. */
export function parseRedisUrl(url: string): RedisConnectionOptions {
  const u = new URL(url);
  const opts: RedisConnectionOptions = {
    host: u.hostname,
    port: Number(u.port || '6379'),
    maxRetriesPerRequest: null,
  };
  if (u.password) opts.password = decodeURIComponent(u.password);
  if (u.username && u.username !== 'default') opts.username = decodeURIComponent(u.username);
  if (u.protocol === 'rediss:') opts.tls = {};
  // redis://host:porta/2 -> banco 2 (sem isso todos os processos caem no banco 0)
  const db = u.pathname.replace(/^\//, '');
  if (/^\d+$/.test(db)) opts.db = Number(db);
  return opts;
}
