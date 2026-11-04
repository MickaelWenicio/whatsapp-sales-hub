import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '../../queue/queue.constants';
import type { EventoMensagem, InboundJob } from './channel.port';

const INTERVALO_MS = 30_000;
const IDADE_MIN_MS = 30_000;
const LOTE = 50;

/**
 * Rede de segurança do webhook: se o enqueue falhou (Redis fora), a linha de InboundEvent fica
 * com processedAt nulo e sem job. Aqui, a cada 30 s (só no papel web), reenfileira essas linhas.
 */
@Injectable()
export class InboundReconciler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboundReconciler.name);
  private timer?: NodeJS.Timeout;
  private rodando = false;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.INBOUND) private readonly inbound: Queue,
    private readonly config?: ConfigService,
  ) {}

  onModuleInit(): void {
    if ((this.config?.get<string>('PROCESS_ROLE') ?? 'web') !== 'web') return;
    this.timer = setInterval(() => void this.reconciliar(), INTERVALO_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Nunca lança. */
  async reconciliar(): Promise<void> {
    if (this.rodando) return;
    this.rodando = true;
    try {
      const linhas = await this.prisma.inboundEvent.findMany({
        where: { processedAt: null, createdAt: { lt: new Date(Date.now() - IDADE_MIN_MS) } },
        orderBy: { createdAt: 'asc' },
        take: LOTE,
      });
      for (const l of linhas) {
        try {
          const evento = l.resumo as Prisma.JsonObject as unknown as EventoMensagem;
          const jobId = l.idMensagem.replace(/:/g, '.');
          if (await this.inbound.getJob(jobId)) continue;
          const job: InboundJob = { inboundEventId: l.id, numeroId: l.numeroId, evento };
          await this.inbound.add('inbound-msg', job, { jobId });
          this.logger.warn(`reenfileirado idMensagem=${l.idMensagem}`);
        } catch (e) {
          this.logger.error(`reconciliação falhou idMensagem=${l.idMensagem} (${(e as Error).message})`);
        }
      }
    } catch (e) {
      this.logger.error(`reconciliador falhou: ${(e as Error).message}`);
    } finally {
      this.rodando = false;
    }
  }
}
