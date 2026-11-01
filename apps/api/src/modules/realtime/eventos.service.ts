import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EventoTempoReal } from '@sales-hub/shared';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../../queue/redis.module';

const BUFFER_MAX = 500;

const PUBLICAR_LUA = `
local id = redis.call('INCR', KEYS[1])
local json = '{"id":"' .. id .. '","tipo":' .. ARGV[1] .. ',"payload":' .. ARGV[2] .. ',"em":' .. ARGV[3] .. '}'
redis.call('LPUSH', KEYS[2], json)
redis.call('LTRIM', KEYS[2], 0, tonumber(ARGV[4]) - 1)
redis.call('PUBLISH', KEYS[3], json)
return id
`;

/**
 * Eventos em tempo real: id sequencial (INCR), buffer dos últimos 500 para replay via
 * Last-Event-ID e pub/sub no Redis. O prefixo das chaves vem de EVENTOS_PREFIX (padrão `saleshub:`).
 */
@Injectable()
export class EventosService {
  private readonly seqKey: string;
  private readonly bufferKey: string;
  private readonly canal: string;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    config: ConfigService,
  ) {
    const prefixo = config.get<string>('EVENTOS_PREFIX') || 'saleshub:';
    this.seqKey = `${prefixo}eventos:seq`;
    this.bufferKey = `${prefixo}eventos:buffer`;
    this.canal = `${prefixo}eventos`;
  }

  async publicar<T extends EventoTempoReal['tipo']>(
    tipo: T,
    payload: Extract<EventoTempoReal, { tipo: T }>['payload'],
  ): Promise<void> {
    // INCR + LPUSH + LTRIM + PUBLISH atômicos: a ordem dos ids = ordem de publicação = ordem do buffer.
    await this.redis.eval(
      PUBLICAR_LUA,
      3,
      this.seqKey,
      this.bufferKey,
      this.canal,
      JSON.stringify(tipo),
      JSON.stringify(payload),
      JSON.stringify(new Date().toISOString()),
      String(BUFFER_MAX),
    );
  }

  /** Eventos do buffer com id maior que `desdeId`, em ordem crescente. */
  async replay(desdeId: string): Promise<EventoTempoReal[]> {
    const desde = Number(desdeId);
    const brutos = await this.redis.lrange(this.bufferKey, 0, -1);
    return brutos
      .map((j) => JSON.parse(j) as EventoTempoReal)
      .filter((e) => Number(e.id) > (Number.isFinite(desde) ? desde : 0))
      .reverse();
  }

  /**
   * Assina o canal numa conexão dedicada. Com `desdeId`, reenvia antes o que perdeu (sem duplicar
   * eventos que chegam durante o replay). Devolve a função que encerra a assinatura.
   */
  async assinar(onEvento: (e: EventoTempoReal) => void, desdeId?: string): Promise<() => Promise<void>> {
    const sub = this.redis.duplicate();
    try {
      let ultimo = desdeId !== undefined ? Number(desdeId) || 0 : 0;
      let reproduzindo = desdeId !== undefined;
      const pendentes: EventoTempoReal[] = [];
      const entregar = (e: EventoTempoReal) => {
        if (Number(e.id) <= ultimo) return;
        ultimo = Number(e.id);
        onEvento(e);
      };

      sub.on('message', (_canal: string, json: string) => {
        const e = JSON.parse(json) as EventoTempoReal;
        if (reproduzindo) pendentes.push(e);
        else entregar(e);
      });
      await sub.subscribe(this.canal);

      if (desdeId !== undefined) {
        for (const e of await this.replay(desdeId)) entregar(e);
        reproduzindo = false;
        for (const e of pendentes) entregar(e);
      }

      return async () => {
        sub.removeAllListeners('message');
        try {
          await sub.unsubscribe(this.canal);
        } finally {
          sub.disconnect();
        }
      };
    } catch (err) {
      sub.disconnect();
      throw err;
    }
  }
}
