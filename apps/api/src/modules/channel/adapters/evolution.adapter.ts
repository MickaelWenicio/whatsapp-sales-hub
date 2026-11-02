import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizarTelefoneBr } from '@sales-hub/shared';
import axios, { type AxiosInstance } from 'axios';
import type { ChannelPort, EstadoConexaoCanal } from '../channel.port';

/** Adaptador do canal WhatsApp via Evolution API v2 (não oficial, pareamento por QR). Multinúmero. */
@Injectable()
export class EvolutionAdapter implements ChannelPort {
  private readonly logger = new Logger(EvolutionAdapter.name);
  private readonly http: AxiosInstance;
  // Anti-flood de log: a saúde é consultada a cada 15 s; loga só a 1ª falha e 1x/min depois.
  private readonly ultimoLogFalha = new Map<string, number>();

  private readonly webhookUrl: string;
  private readonly webhookToken: string;

  constructor(config: ConfigService) {
    this.webhookToken = config.get<string>('EVOLUTION_WEBHOOK_TOKEN') ?? '';
    this.webhookUrl = `${
      config.get<string>('WEBHOOK_TARGET') ?? 'http://host.docker.internal:3311/webhook/evolution'
    }?token=${encodeURIComponent(this.webhookToken)}`;
    this.http = axios.create({
      baseURL: config.get<string>('EVOLUTION_API_URL') ?? '',
      headers: { apikey: config.get<string>('EVOLUTION_API_KEY') ?? '' },
      timeout: 15_000,
    });
  }

  /** A Evolution espera só dígitos (sem "+"). */
  private numero(para: string): string {
    return para.replace(/\D/g, '');
  }

  async enviarTexto(
    instancia: string,
    para: string,
    texto: string,
    opts?: { citarId?: string },
  ): Promise<{ idExterno: string }> {
    // sem `delay`: o "digitando" é responsabilidade do processador de saída (enviarPresenca)
    const { data } = await this.http.post<{ key?: { id?: string } }>(
      `/message/sendText/${encodeURIComponent(instancia)}`,
      {
        number: this.numero(para),
        text: texto,
        ...(opts?.citarId ? { quoted: { key: { id: opts.citarId } } } : {}),
      },
    );
    return { idExterno: data?.key?.id ?? '' };
  }

  async enviarPresenca(
    instancia: string,
    para: string,
    estado: 'composing' | 'paused',
    duracaoMs: number,
  ): Promise<void> {
    await this.http.post(`/chat/sendPresence/${encodeURIComponent(instancia)}`, {
      number: this.numero(para),
      presence: estado,
      delay: Math.max(0, Math.round(duracaoMs)),
    });
  }

  async estadoConexao(instancia: string): Promise<{ estado: EstadoConexaoCanal }> {
    try {
      const { data } = await this.http.get<{ instance?: { state?: string }; state?: string }>(
        `/instance/connectionState/${encodeURIComponent(instancia)}`,
        { timeout: 8_000 },
      );
      const state = data?.instance?.state ?? data?.state;
      const estado: EstadoConexaoCanal =
        state === 'open' ? 'conectado' : state === 'connecting' ? 'reconectando' : 'desconectado';
      return { estado };
    } catch (e) {
      const agora = Date.now();
      if (agora - (this.ultimoLogFalha.get(instancia) ?? 0) > 60_000) {
        this.logger.warn(`Evolution inalcançável para a instância ${instancia}: ${(e as Error).message}`);
        this.ultimoLogFalha.set(instancia, agora);
      }
      return { estado: 'erro' };
    }
  }

  /** Não propaga erro: o painel polla enquanto desconectado; sem QR devolve nulos. */
  async obterQr(instancia: string): Promise<{ base64: string | null; pairingCode: string | null }> {
    try {
      const { data } = await this.http.get<{ base64?: string; pairingCode?: string }>(
        `/instance/connect/${encodeURIComponent(instancia)}`,
      );
      const b64 = data?.base64;
      const base64 = b64 ? (b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`) : null;
      return { base64, pairingCode: data?.pairingCode ?? null };
    } catch (e) {
      this.logger.warn(`Falha ao obter QR da instância ${instancia}: ${(e as Error).message}`);
      return { base64: null, pairingCode: null };
    }
  }

  async desconectar(instancia: string): Promise<void> {
    await this.http.delete(`/instance/logout/${encodeURIComponent(instancia)}`);
  }

  async reiniciar(instancia: string): Promise<void> {
    await this.http.put(`/instance/restart/${encodeURIComponent(instancia)}`);
  }

  async numeroDaInstancia(instancia: string): Promise<string | null> {
    try {
      const { data } = await this.http.get<unknown>('/instance/fetchInstances', {
        params: { instanceName: instancia },
        timeout: 8_000,
      });
      const lista = Array.isArray(data) ? data : [data];
      for (const item of lista) {
        const o = item as {
          name?: string;
          ownerJid?: string;
          instance?: { instanceName?: string; owner?: string; ownerJid?: string };
        } | null;
        if ((o?.name ?? o?.instance?.instanceName) !== instancia) continue;
        const jid = o?.ownerJid ?? o?.instance?.ownerJid ?? o?.instance?.owner;
        if (typeof jid === 'string' && jid.endsWith('@s.whatsapp.net')) {
          return normalizarTelefoneBr(jid.split('@')[0]);
        }
      }
      return null;
    } catch (e) {
      this.logger.warn(`Falha ao ler o dono da instância ${instancia}: ${(e as Error).message}`);
      return null;
    }
  }

  async criarInstancia(instancia: string): Promise<void> {
    try {
      await this.http.post('/instance/create', {
        instanceName: instancia,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
      });
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status;
      // 403/409: a instância já existe, segue para o webhook
      if (status !== 403 && status !== 409) throw e;
    }
  }

  async configurarWebhook(instancia: string): Promise<void> {
    await this.http.post(`/webhook/set/${encodeURIComponent(instancia)}`, {
      webhook: {
        enabled: true,
        url: this.webhookUrl,
        headers: { apikey: this.webhookToken },
        byEvents: false,
        base64: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'SEND_MESSAGE',
          'CONNECTION_UPDATE',
          'QRCODE_UPDATED',
          'CONTACTS_UPSERT',
          'CONTACTS_UPDATE',
        ],
      },
    });
  }

  async removerInstancia(instancia: string): Promise<void> {
    // logout falha se a instância não estiver pareada; o delete é o que importa
    await this.http.delete(`/instance/logout/${encodeURIComponent(instancia)}`).catch(() => undefined);
    await this.http.delete(`/instance/delete/${encodeURIComponent(instancia)}`).catch((e) => {
      if ((e as { response?: { status?: number } }).response?.status !== 404) throw e;
    });
  }
}
