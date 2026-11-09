import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { EventoTempoReal } from '@sales-hub/shared';
import type { Queue } from 'bullmq';
import { INCLUDE_CONVERSA_ITEM, paraConversaItemDTO, paraMensagemDTO } from '../../common/mapeadores';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '../../queue/queue.constants';
import { EventosService } from '../realtime/eventos.service';
import { calcularDelayDigitando } from './outbound.humanize';

/** Nome do job na fila `QUEUES.OUTBOUND`. */
export const JOB_ENVIAR = 'enviar';

/** Payload do job. `digitandoMs` = tempo de "digitando" que o processador mostra antes de revalidar. */
export interface JobEnvio {
  messageId: string;
  digitandoMs: number;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Produtor da saída: cria as `Message` pendentes e enfileira um job por mensagem
 * (`jobId = messageId`). O envio e a verificação de envio ficam no `OutboundProcessor` (worker).
 * Usado pelo papel web (painel) e pelo worker (agente).
 */
@Injectable()
export class OutboundService {
  private readonly logger = new Logger(OutboundService.name);

  constructor(
    @InjectQueue(QUEUES.OUTBOUND) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly eventos: EventosService,
  ) {}

  /**
   * Enfileira o envio de uma mensagem já gravada como `pendente`. O job não tem `delay` na fila:
   * o "digitando" (`digitandoMs`) é mostrado pelo processador, que revalida tudo depois dele.
   * Mesmo `jobId` enquanto o job existir = sem duplicata.
   */
  async enfileirar(messageId: string, digitandoMs: number): Promise<void> {
    const dados: JobEnvio = { messageId, digitandoMs: Math.max(0, Math.round(digitandoMs || 0)) };
    await this.queue.add(JOB_ENVIAR, dados, {
      jobId: messageId,
      delay: 0,
      // libera o jobId ao concluir: "Tentar de novo" pode reenfileirar com o mesmo id
      removeOnComplete: true,
      removeOnFail: { count: 1000 },
    });
  }

  /**
   * Bolhas da IA: `Message autor ia`, `pendente`, com a versão de controle do turno.
   * Se a conversa já saiu do controle da IA (versão mudou ou estado ≠ IA_ATIVA), não cria nada e
   * devolve `[]`: nenhuma bolha "fantasma" aparece no painel depois do clique. (A garantia de não
   * enviar continua sendo a revalidação do processador.)
   */
  async criarBolhasIa(p: { conversationId: string; textos: string[]; agentTurnId: string; versao: number }): Promise<string[]> {
    const conv = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: p.conversationId },
      select: { numeroId: true, versaoControle: true, estado: true },
    });
    if (conv.versaoControle !== p.versao || conv.estado !== 'IA_ATIVA') {
      this.logger.log(
        `bolhas descartadas em ${p.conversationId}: conversa ${conv.estado} v${conv.versaoControle}, turno v${p.versao}`,
      );
      return [];
    }
    const ids: string[] = [];
    for (const texto of p.textos) {
      const m = await this.prisma.message.create({
        data: {
          conversationId: p.conversationId,
          numeroId: conv.numeroId,
          autor: 'ia',
          tipo: 'texto',
          texto,
          status: 'pendente',
          agentTurnId: p.agentTurnId,
          versaoControle: p.versao,
        },
      });
      ids.push(m.id);
      await this.publicar('message.created', { conversationId: p.conversationId, mensagem: paraMensagemDTO(m) });
      await this.enfileirar(m.id, calcularDelayDigitando(texto));
    }
    if (ids.length > 0) await this.tocarConversa(p.conversationId);
    return ids;
  }

  /**
   * Texto fixo do servidor: `autor sistema`, `tipo texto`, sem "digitando".
   * - Sem `versao` (emergência, interrupção): não é automático para `decidirEnvio`; sai mesmo depois
   *   de "Assumir".
   * - Com `versao` (contingência): grava `versaoControle = versao` e passa a ser automático, então
   *   "Assumir", versão nova ou IA desligada o cancelam como a uma bolha da IA.
   */
  async criarMensagemSistema(p: {
    conversationId: string;
    texto: string;
    confirmadoRestrito?: boolean;
    versao?: number;
  }): Promise<string> {
    const conv = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: p.conversationId },
      select: { numeroId: true },
    });
    const m = await this.prisma.message.create({
      data: {
        conversationId: p.conversationId,
        numeroId: conv.numeroId,
        autor: 'sistema',
        tipo: 'texto',
        texto: p.texto,
        status: 'pendente',
        confirmadoRestrito: p.confirmadoRestrito ?? false,
        versaoControle: p.versao ?? null,
      },
    });
    await this.publicar('message.created', { conversationId: p.conversationId, mensagem: paraMensagemDTO(m) });
    await this.enfileirar(m.id, 0);
    await this.tocarConversa(p.conversationId);
    return m.id;
  }

  /**
   * Cancela as mensagens automáticas ainda `pendente` da conversa (autor `ia`, ou `sistema` com
   * versão, como a contingência) e remove os jobs.
   * Job já ativo (travado pelo worker) não sai da fila: o processador o barra na revalidação,
   * porque a mensagem deixou de estar `pendente`. Devolve quantas foram canceladas.
   */
  async cancelarAutomaticasPendentes(conversationId: string, motivo: string): Promise<number> {
    const canceladas = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE messages
         SET status = 'cancelada'::"StatusMensagem", "motivoFalha" = ${motivo}
       WHERE "conversationId" = ${conversationId}
         AND (autor = 'ia'::"AutorMensagem"
              OR (autor = 'sistema'::"AutorMensagem" AND "versaoControle" IS NOT NULL))
         AND status = 'pendente'::"StatusMensagem"
      RETURNING id`;
    for (const { id } of canceladas) {
      try {
        await this.queue.remove(id);
      } catch (e) {
        this.logger.warn(`não removeu o job ${id}: ${(e as Error).message}`);
      }
      await this.publicar('message.updated', { conversationId, mensagemId: id, status: 'cancelada', motivoFalha: motivo });
    }
    return canceladas.length;
  }

  /** "Tentar de novo": só `falhou` → `pendente`, reenfileirada com o mesmo `jobId`. */
  async reenviar(messageId: string): Promise<void> {
    const m = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!m) throw new NotFoundException('Mensagem não encontrada');
    if (m.status !== 'falhou') throw new ConflictException('Só uma mensagem que falhou pode ser reenviada');

    await this.liberarJobId(messageId);
    const r = await this.prisma.message.updateMany({
      where: { id: messageId, status: 'falhou' },
      data: { status: 'pendente', motivoFalha: null },
    });
    if (r.count === 0) throw new ConflictException('Só uma mensagem que falhou pode ser reenviada');
    await this.publicar('message.updated', {
      conversationId: m.conversationId,
      mensagemId: messageId,
      status: 'pendente',
      motivoFalha: null,
    });
    try {
      await this.enfileirar(messageId, m.autor === 'ia' ? calcularDelayDigitando(m.texto ?? '') : 0);
    } catch {
      const motivoFalha = 'Fila de envio indisponível. Tente de novo em instantes.';
      // Do not leave a pending message without a job; preserve any worker that already claimed it.
      const restored = await this.prisma.message.updateMany({
        where: { id: messageId, status: 'pendente' },
        data: { status: 'falhou', motivoFalha },
      });
      if (restored.count) await this.publicar('message.updated', {
        conversationId: m.conversationId, mensagemId: messageId, status: 'falhou', motivoFalha,
      });
      throw new ServiceUnavailableException(motivoFalha);
    }
  }

  /**
   * O BullMQ ignora `add` com um jobId que ainda existe (concluído, falho ou ativo). Remove o job
   * antigo; se ele ainda estiver terminando (travado), espera alguns instantes.
   */
  private async liberarJobId(jobId: string): Promise<void> {
    for (let i = 0; i < 20; i++) {
      await this.queue.remove(jobId);
      if (!(await this.queue.getJob(jobId))) return;
      await esperar(150);
    }
    throw new ConflictException('O envio anterior desta mensagem ainda está em andamento. Tente de novo em instantes');
  }

  private async tocarConversa(conversationId: string): Promise<void> {
    try {
      const conv = await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { ultimaMensagemEm: new Date() },
        include: INCLUDE_CONVERSA_ITEM,
      });
      await this.publicar('conversation.updated', { conversa: paraConversaItemDTO(conv) });
    } catch (e) {
      this.logger.warn(`não atualizou a conversa ${conversationId}: ${(e as Error).message}`);
    }
  }

  /** Eventos em tempo real são best-effort: nunca derrubam a operação que já foi gravada. */
  private async publicar<T extends EventoTempoReal['tipo']>(
    tipo: T,
    payload: Extract<EventoTempoReal, { tipo: T }>['payload'],
  ): Promise<void> {
    try {
      // a assinatura tipada fica no wrapper; o repasse genérico não é inferível pelo TS
      await (this.eventos.publicar as (t: string, p: unknown) => Promise<void>)(tipo, payload);
    } catch (e) {
      this.logger.warn(`falha ao publicar ${tipo}: ${(e as Error).message}`);
    }
  }
}
