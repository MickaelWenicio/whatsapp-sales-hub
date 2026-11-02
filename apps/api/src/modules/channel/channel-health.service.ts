import { Inject, Injectable, Logger } from '@nestjs/common';
import { CHANNEL_PORT, type ChannelPort, type EstadoConexaoCanal } from './channel.port';

/** Janela de cache: o painel faz polling, a Evolution não precisa ser martelada. */
const TTL_MS = 15_000;
/** Teto de espera de UMA leitura; uma Evolution pendurada não segura o chamador. */
const TIMEOUT_MS = 4_000;

export interface SaudeCanal {
  estado: EstadoConexaoCanal;
  /** ISO da última leitura concluída (null = nunca leu). */
  verificadoEm: string | null;
}

interface Leitura {
  ts: number;
  estado: EstadoConexaoCanal;
}

/**
 * Saúde do canal por instância, com cache (15 s) e timeout curto (4 s).
 * `status()` serve o painel (responde do cache e atualiza em segundo plano);
 * `verificar()` força uma leitura nova (usada pela sincronização periódica).
 * Estourar o timeout responde `erro`, mas a leitura em voo termina e atualiza o cache.
 */
@Injectable()
export class ChannelHealthService {
  private readonly logger = new Logger(ChannelHealthService.name);
  private readonly cache = new Map<string, Leitura>();
  private readonly emVoo = new Map<string, Promise<Leitura>>();

  constructor(@Inject(CHANNEL_PORT) private readonly channel: ChannelPort) {}

  async status(instancia: string): Promise<SaudeCanal> {
    const atual = this.cache.get(instancia);
    if (!atual || Date.now() - atual.ts >= TTL_MS) {
      const leitura = this.ler(instancia);
      // com leitura anterior, responde na hora com ela; sem nenhuma, espera (com teto)
      if (!atual) await Promise.race([leitura, this.esperar(TIMEOUT_MS)]);
    }
    return this.saude(instancia);
  }

  /** Leitura nova, ignorando o cache. Nunca rejeita. */
  async verificar(instancia: string): Promise<SaudeCanal> {
    const r = await Promise.race([this.ler(instancia), this.esperar(TIMEOUT_MS).then(() => 'timeout' as const)]);
    // estourou o teto: não devolve o estado antigo do cache como se fosse fresco
    if (r === 'timeout') return { estado: 'erro', verificadoEm: null };
    return this.saude(instancia);
  }

  private saude(instancia: string): SaudeCanal {
    const l = this.cache.get(instancia);
    return { estado: l?.estado ?? 'erro', verificadoEm: l ? new Date(l.ts).toISOString() : null };
  }

  /** Uma consulta por vez por instância; atualiza o cache. Nunca rejeita. */
  private ler(instancia: string): Promise<Leitura> {
    let p = this.emVoo.get(instancia);
    if (!p) {
      p = this.channel
        .estadoConexao(instancia)
        .then((r) => r.estado)
        .catch((e): EstadoConexaoCanal => {
          this.logger.warn(`falha ao consultar a saúde do canal ${instancia}: ${(e as Error).message}`);
          return 'erro';
        })
        .then((estado) => {
          const leitura = { ts: Date.now(), estado };
          this.cache.set(instancia, leitura);
          this.emVoo.delete(instancia);
          return leitura;
        });
      this.emVoo.set(instancia, p);
    }
    return p;
  }

  private esperar(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      t.unref?.();
    });
  }
}
