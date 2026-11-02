import type { TipoMensagem } from '@sales-hub/shared';

/**
 * `ChannelPort`: porta do canal de WhatsApp, multinúmero (cada chamada recebe a instância).
 * O núcleo depende só desta interface; o adaptador concreto é a Evolution API.
 */

/** Token de DI para injetar o adaptador ativo. */
export const CHANNEL_PORT = Symbol('CHANNEL_PORT');

export type EstadoConexaoCanal = 'conectado' | 'reconectando' | 'desconectado' | 'erro';

export type EventoCanal =
  | {
      tipo: 'mensagem';
      instancia: string;
      /** E.164 do contato (para fromMe, o destinatário). */
      de: string;
      idExterno: string;
      fromMe: boolean;
      tipoMensagem: TipoMensagem;
      texto?: string;
      pushName?: string;
      timestamp: string;
    }
  | { tipo: 'status'; instancia: string; idExterno: string; status: 'enviada' | 'entregue' | 'lida' }
  | { tipo: 'reacao'; instancia: string; idExterno: string; alvoIdExterno: string; emoji: string }
  | { tipo: 'conexao'; instancia: string; estado: 'conectado' | 'reconectando' | 'desconectado' }
  | { tipo: 'contato'; instancia: string; de: string; pushName?: string };

export type EventoMensagem = Extract<EventoCanal, { tipo: 'mensagem' }>;

/** Payload enfileirado em `QUEUES.INBOUND` pelo webhook. */
export interface InboundJob {
  inboundEventId: string;
  numeroId: string;
  evento: EventoMensagem;
}

export interface ChannelPort {
  enviarTexto(
    instancia: string,
    para: string,
    texto: string,
    opts?: { citarId?: string },
  ): Promise<{ idExterno: string }>;
  enviarPresenca(
    instancia: string,
    para: string,
    estado: 'composing' | 'paused',
    duracaoMs: number,
  ): Promise<void>;
  /** Evolution inalcançável (recusa/timeout) devolve `{ estado: 'erro' }`; nunca lança. */
  estadoConexao(instancia: string): Promise<{ estado: EstadoConexaoCanal }>;
  obterQr(instancia: string): Promise<{ base64: string | null; pairingCode: string | null }>;
  desconectar(instancia: string): Promise<void>;
  reiniciar(instancia: string): Promise<void>;
  /** E.164 do número pareado na instância (ownerJid), ou null se não pareada/inalcançável. */
  numeroDaInstancia(instancia: string): Promise<string | null>;
  /** Cria a instância na Evolution (idempotente: se já existir, segue). */
  criarInstancia(instancia: string): Promise<void>;
  /** Aponta o webhook da instância para a API. */
  configurarWebhook(instancia: string): Promise<void>;
  /** Faz logout e apaga a instância; ignora 404. */
  removerInstancia(instancia: string): Promise<void>;
}
