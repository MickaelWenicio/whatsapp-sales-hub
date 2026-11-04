import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../queue/redis.module';

const LIBERAR_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;
const RENOVAR_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
return 0
`;
const VISTO_TTL_S = 7 * 24 * 3600;

/** Trava por conversa (um turno por vez, entre processos) e marcador do que o último turno já viu. */
@Injectable()
export class TurnoLockService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private chave(conversationId: string): string {
    return `saleshub:turno:${conversationId}`;
  }

  private chaveVisto(conversationId: string): string {
    return `saleshub:turno:visto:${conversationId}`;
  }

  /** `SET saleshub:turno:<id> <token> NX PX ttl`. Devolve o token do dono, ou null se já está presa. */
  async adquirir(conversationId: string, ttlMs = 120_000): Promise<string | null> {
    const token = randomUUID();
    const r = await this.redis.set(this.chave(conversationId), token, 'PX', ttlMs, 'NX');
    return r === 'OK' ? token : null;
  }

  /** Compare-and-delete: só apaga se o token ainda for o do dono. */
  async liberar(conversationId: string, token: string): Promise<void> {
    await this.redis.eval(LIBERAR_LUA, 1, this.chave(conversationId), token);
  }

  /** Estende o TTL só se ainda formos donos. Verdadeiro se renovou. */
  async renovar(conversationId: string, token: string, ttlMs = 120_000): Promise<boolean> {
    return (await this.redis.eval(RENOVAR_LUA, 1, this.chave(conversationId), token, String(ttlMs))) === 1;
  }

  /** Marca até qual mensagem do cliente (criadaEm em ms) o último turno enxergou. */
  async marcarVisto(conversationId: string, ate: number): Promise<void> {
    await this.redis.set(this.chaveVisto(conversationId), String(ate), 'EX', VISTO_TTL_S);
  }

  async lerVisto(conversationId: string): Promise<number | null> {
    const v = await this.redis.get(this.chaveVisto(conversationId));
    return v ? Number(v) : null;
  }
}
