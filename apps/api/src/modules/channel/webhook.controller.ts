import { InjectQueue } from '@nestjs/bullmq';
import { Body, Controller, Headers, HttpCode, Logger, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type StatusMensagem } from '@prisma/client';
import type { Queue } from 'bullmq';
import { compararSegredo } from '../../common/compare-secret';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '../../queue/queue.constants';
import { EventosService } from '../realtime/eventos.service';
import { normalizarEvento } from './adapters/evolution.normalize';
import type { EventoCanal, InboundJob } from './channel.port';
import { NumerosService } from './numeros.service';

/** Ordem dos ticks; um status nunca regride (READ não volta para DELIVERY_ACK). */
const RANK_STATUS: Partial<Record<StatusMensagem, number>> = {
  pendente: 0,
  enviando: 1,
  enviada: 2,
  entregue: 3,
  lida: 4,
};

/**
 * Webhook da Evolution. Responde SEMPRE 200 (a Evolution não deve reentregar por erro nosso):
 * valida o token, normaliza, deduplica por idExterno e enfileira. Não roda o agente aqui.
 */
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly numeros: NumerosService,
    private readonly eventos: EventosService,
    @InjectQueue(QUEUES.INBOUND) private readonly inbound: Queue,
  ) {}

  @Post('evolution')
  @HttpCode(200)
  async evolution(
    @Body() body: unknown,
    @Headers('apikey') apikey?: string,
    @Headers('x-webhook-token') headerToken?: string,
    @Query('token') queryToken?: string,
  ): Promise<{ received: true }> {
    if (!this.tokenValido([apikey, headerToken, queryToken])) {
      this.logger.warn('webhook Evolution: token inválido, evento ignorado');
      return { received: true };
    }
    try {
      for (const evento of normalizarEvento(body, new Date())) {
        try {
          await this.tratar(evento);
        } catch (e) {
          this.logger.warn(`webhook Evolution: falha ao tratar evento ${evento.tipo} (${(e as Error).message})`);
        }
      }
    } catch (e) {
      this.logger.warn(`webhook Evolution: payload inválido (${(e as Error).message})`);
    }
    return { received: true };
  }

  private async tratar(evento: EventoCanal): Promise<void> {
    switch (evento.tipo) {
      case 'mensagem':
        return this.registrarMensagem(evento);
      case 'status':
        return this.aplicarStatus(evento);
      case 'conexao': {
        const numero = await this.numeros.porInstancia(evento.instancia);
        if (numero) await this.numeros.atualizarEstado(numero.id, evento.estado);
        return;
      }
      case 'reacao':
        return this.aplicarReacao(evento);
      case 'contato':
        return this.aplicarContato(evento);
    }
  }

  /**
   * Reação a uma mensagem: o schema não tem campo para o emoji, então não persiste; só avisa
   * o painel (`message.updated` com `reacao`). Não gera turno do agente.
   */
  private async aplicarReacao(evento: Extract<EventoCanal, { tipo: 'reacao' }>): Promise<void> {
    const numero = await this.numeros.porInstancia(evento.instancia);
    if (!numero) return;
    const alvo = await this.prisma.message.findUnique({
      where: { numeroId_idExterno: { numeroId: numero.id, idExterno: evento.alvoIdExterno } },
      select: { id: true, conversationId: true, status: true },
    });
    if (!alvo) return;
    await this.eventos.publicar('message.updated', {
      conversationId: alvo.conversationId,
      mensagemId: alvo.id,
      // mensagens de entrada não têm status; o contrato exige um, então mantém o "mais alto" neutro
      status: alvo.status ?? 'entregue',
      reacao: evento.emoji,
    } as never);
  }

  /** Contato novo/atualizado no celular: só preenche o nome de contatos que ainda não têm. */
  private async aplicarContato(evento: Extract<EventoCanal, { tipo: 'contato' }>): Promise<void> {
    if (!evento.pushName?.trim()) return;
    await this.prisma.contact.updateMany({
      where: { e164: evento.de, nome: null },
      data: { nome: evento.pushName.trim() },
    });
  }

  private async registrarMensagem(evento: Extract<EventoCanal, { tipo: 'mensagem' }>): Promise<void> {
    const numero = await this.numeros.porInstancia(evento.instancia);
    if (!numero) {
      this.logger.warn(`webhook Evolution: instância desconhecida "${evento.instancia}"`);
      return;
    }
    let criado: { id: string };
    try {
      criado = await this.prisma.inboundEvent.create({
        data: {
          idMensagem: evento.idExterno,
          numeroId: numero.id,
          // evento normalizado, nunca o payload bruto
          resumo: evento as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return; // reentrega = no-op
      throw e;
    }
    const job: InboundJob = { inboundEventId: criado.id, numeroId: numero.id, evento };
    try {
      await this.inbound.add('inbound-msg', job, { jobId: evento.idExterno.replace(/:/g, '.') });
    } catch (e) {
      // mantém a linha: o InboundReconciler reenfileira (processedAt nulo, sem job)
      this.logger.error(`webhook Evolution: falha ao enfileirar idMensagem=${evento.idExterno} (${(e as Error).message})`);
    }
  }

  private async aplicarStatus(evento: Extract<EventoCanal, { tipo: 'status' }>): Promise<void> {
    const numero = await this.numeros.porInstancia(evento.instancia);
    if (!numero) return;
    const msg = await this.prisma.message.findUnique({
      where: { numeroId_idExterno: { numeroId: numero.id, idExterno: evento.idExterno } },
      select: { id: true, conversationId: true, status: true },
    });
    // entrada (status nulo), falha e cancelamento não recebem ticks
    if (!msg || !msg.status) return;
    const atual = RANK_STATUS[msg.status];
    if (atual === undefined || RANK_STATUS[evento.status]! <= atual) return;
    await this.prisma.message.update({ where: { id: msg.id }, data: { status: evento.status } });
    await this.eventos.publicar('message.updated', {
      conversationId: msg.conversationId,
      mensagemId: msg.id,
      status: evento.status,
    });
  }

  private tokenValido(candidatos: Array<string | undefined>): boolean {
    const esperado = this.config.get<string>('EVOLUTION_WEBHOOK_TOKEN');
    if (!esperado) {
      if (this.config.get<string>('NODE_ENV') === 'production') return false; // fail-closed
      this.logger.warn('EVOLUTION_WEBHOOK_TOKEN não configurado: webhook aberto (só dev).');
      return true;
    }
    return candidatos.some((c) => compararSegredo(c, esperado));
  }
}
