import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type EstadoNumero, type WhatsAppNumber } from '@prisma/client';
import type { NumeroDTO } from '@sales-hub/shared';
import { paraNumeroDTO } from '../../common/mapeadores';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../security/audit.service';
import { EventosService } from '../realtime/eventos.service';
import { ChannelHealthService } from './channel-health.service';
import { CHANNEL_PORT, type ChannelPort } from './channel.port';

const INTERVALO_SYNC_MS = 15_000;

/** Estados que o canal informa; `erro` = Evolution inalcançável (grava desconectado + ultimaFalha). */
export type EstadoNumeroEntrada = EstadoNumero | 'erro';

/**
 * Números de WhatsApp da empresa (um por instância Evolution): consulta, estado e sincronização.
 * `sincronizar()` roda a cada 15 s, só no papel `web`, e nunca lança para fora do intervalo.
 */
@Injectable()
export class NumerosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NumerosService.name);
  private timer?: NodeJS.Timeout;
  private sincronizando = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly eventos: EventosService,
    private readonly health: ChannelHealthService,
    @Inject(CHANNEL_PORT) private readonly channel: ChannelPort,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if ((this.config.get<string>('PROCESS_ROLE') ?? 'web') !== 'web') return;
    const rodar = () => {
      void this.sincronizar().catch((e) => this.logger.warn(`sincronização de números falhou: ${(e as Error).message}`));
    };
    rodar();
    this.timer = setInterval(rodar, INTERVALO_SYNC_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  porInstancia(instancia: string): Promise<WhatsAppNumber | null> {
    return this.prisma.whatsAppNumber.findUnique({ where: { instanciaEvolution: instancia } });
  }

  async listar(): Promise<NumeroDTO[]> {
    const numeros = await this.prisma.whatsAppNumber.findMany({ orderBy: [{ ficticio: 'asc' }, { rotulo: 'asc' }] });
    return numeros.map(paraNumeroDTO);
  }

  /**
   * Grava o estado e, só quando o estado visível (DTO) muda, audita e publica `number.status`.
   * Devolve true se mudou.
   */
  async atualizarEstado(numeroId: string, estado: EstadoNumeroEntrada, falha?: string): Promise<boolean> {
    const antes = await this.prisma.whatsAppNumber.findUnique({ where: { id: numeroId } });
    if (!antes) return false;
    const estadoAntes = paraNumeroDTO(antes).estado;

    const dbEstado: EstadoNumero = estado === 'erro' ? 'desconectado' : estado;
    const ultimaFalha = estado === 'erro' ? (falha ?? 'Evolution inalcançável') : null;
    const estadoDepois = estado === 'erro' ? 'erro' : estado;
    const mudou = estadoAntes !== estadoDepois;

    const depois = await this.prisma.whatsAppNumber.update({
      where: { id: numeroId },
      data: { estado: dbEstado, ultimaFalha, ...(mudou ? { ultimoEstadoEm: new Date() } : {}) },
    });
    if (!mudou) return false;

    await this.audit.registrar({
      ator: 'sistema',
      acao: `numero_estado:${estadoAntes}->${estadoDepois}`,
      entidade: 'whatsapp_number',
      entidadeId: numeroId,
    });
    await this.eventos.publicar('number.status', { numero: paraNumeroDTO(depois) });
    return true;
  }

  /** Consulta o estado de cada número real e, se conectado, confere o e164 do dono da instância. */
  async sincronizar(): Promise<void> {
    if (this.sincronizando) return;
    this.sincronizando = true;
    try {
      const numeros = await this.prisma.whatsAppNumber.findMany({ where: { ficticio: false } });
      for (const numero of numeros) {
        try {
          await this.sincronizarUm(numero);
        } catch (e) {
          this.logger.warn(`sincronização do número ${numero.instanciaEvolution} falhou: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      this.logger.warn(`sincronização de números falhou: ${(e as Error).message}`);
    } finally {
      this.sincronizando = false;
    }
  }

  private async sincronizarUm(numero: WhatsAppNumber): Promise<void> {
    const { estado } = await this.health.verificar(numero.instanciaEvolution);
    const e164Mudou = estado === 'conectado' && (await this.conferirE164(numero));
    const mudou = await this.atualizarEstado(
      numero.id,
      estado,
      estado === 'erro' ? 'Evolution inalcançável na última verificação' : undefined,
    );
    if (e164Mudou && !mudou) {
      const atual = await this.prisma.whatsAppNumber.findUnique({ where: { id: numero.id } });
      if (atual) await this.eventos.publicar('number.status', { numero: paraNumeroDTO(atual) });
    }
  }

  /** Atualiza o e164 quando o dono da instância difere do gravado. Devolve true se atualizou. */
  private async conferirE164(numero: WhatsAppNumber): Promise<boolean> {
    const dono = await this.channel.numeroDaInstancia(numero.instanciaEvolution);
    if (!dono || dono === numero.e164) return false;
    try {
      await this.prisma.whatsAppNumber.update({ where: { id: numero.id }, data: { e164: dono } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        this.logger.warn(`e164 ${dono} já pertence a outro número; instância ${numero.instanciaEvolution} não atualizada`);
        return false;
      }
      throw e;
    }
    await this.audit.registrar({
      ator: 'sistema',
      acao: 'numero_e164_atualizado',
      entidade: 'whatsapp_number',
      entidadeId: numero.id,
    });
    return true;
  }
}
