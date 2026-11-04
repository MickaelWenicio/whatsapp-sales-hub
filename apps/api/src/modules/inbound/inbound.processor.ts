import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { preClassificar } from '@sales-hub/shared';
import { Job, Queue } from 'bullmq';
import { INCLUDE_CONVERSA_ITEM, paraConversaItemDTO, paraMensagemDTO } from '../../common/mapeadores';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '../../queue/queue.constants';
import type { EventoMensagem, InboundJob } from '../channel/channel.port';
import { EventosService } from '../realtime/eventos.service';
import { SettingsService } from '../security/settings.service';
import type { AgentTurnJob } from './agent-turn.processor';

const DIA_MS = 24 * 60 * 60 * 1000;
/** Janela em que um eco `fromMe` ainda pode casar por texto com um envio nosso sem idExterno. */
const JANELA_ECO_MS = 2 * 60 * 1000;

const TEXTO_MIDIA: Record<string, string> = {
  audio: '[o cliente enviou um áudio]',
  imagem: '[o cliente enviou uma imagem]',
  documento: '[o cliente enviou um documento]',
  video: '[o cliente enviou um vídeo]',
};

/**
 * Consome `inbound-process` (ingestão): resolve contato e conversa única (contato+número),
 * grava a mensagem, publica eventos em tempo real e agenda o turno do agente com atraso
 * (debounce). Não roda o agente aqui. concurrency 1 preserva a ordem das mensagens.
 */
@Processor(QUEUES.INBOUND, { concurrency: 1 })
export class InboundProcessor extends WorkerHost {
  private readonly logger = new Logger(InboundProcessor.name);
  private readonly debounceMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: EventosService,
    private readonly settings: SettingsService,
    @InjectQueue(QUEUES.AGENT_TURN) private readonly agentTurn: Queue<AgentTurnJob>,
    config: ConfigService,
  ) {
    super();
    this.debounceMs = config.get<number>('AGENT_DEBOUNCE_MS') ?? 3000;
  }

  async process(job: Job<InboundJob>): Promise<void> {
    const { numeroId, evento, inboundEventId } = job.data;
    const conversa = await this.resolverConversa(numeroId, evento);
    if (evento.fromMe) await this.processarSaidaDoCelular(numeroId, conversa.id, evento);
    else await this.processarEntrada(numeroId, conversa.id, evento);
    await this.prisma.inboundEvent.updateMany({
      where: { id: inboundEventId },
      data: { processedAt: new Date() },
    });
  }

  /** Contato por e164 (nome = pushName do cliente) e a conversa única (contato+número). */
  private async resolverConversa(numeroId: string, ev: EventoMensagem): Promise<{ id: string }> {
    const nomeDoCliente = !ev.fromMe && ev.pushName?.trim() ? ev.pushName.trim() : undefined;
    // Em fromMe o pushName é o nosso, não do contato.
    const contato = await this.prisma.contact.upsert({
      where: { e164: ev.de },
      create: { e164: ev.de, ...(nomeDoCliente ? { nome: nomeDoCliente } : {}) },
      update: {},
    });
    if (nomeDoCliente && !contato.nome) {
      await this.prisma.contact.update({ where: { id: contato.id }, data: { nome: nomeDoCliente } });
    }
    return this.prisma.conversation.upsert({
      where: { contactId_numeroId: { contactId: contato.id, numeroId } },
      create: { contactId: contato.id, numeroId },
      update: {},
      select: { id: true },
    });
  }

  private async processarEntrada(numeroId: string, conversationId: string, ev: EventoMensagem): Promise<void> {
    const existente = await this.prisma.message.findUnique({
      where: { numeroId_idExterno: { numeroId, idExterno: ev.idExterno } },
      select: { id: true },
    });
    if (existente) return; // reentrega do mesmo evento: já processado

    const texto = this.textoDaEntrada(ev);
    const sinais = ev.tipoMensagem === 'texto' && texto ? preClassificar(texto) : { emergencia: false, interrupcao: false };
    const agora = new Date();

    const msg = await this.prisma.$transaction(async (tx) => {
      const atual = await tx.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        select: { estado: true },
      });
      const reabrir = atual.estado === 'ENCERRADA';
      const criada = await tx.message.create({
        data: {
          conversationId,
          numeroId,
          autor: 'cliente',
          tipo: ev.tipoMensagem,
          texto,
          idExterno: ev.idExterno,
          criadaEm: agora,
        },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          naoLidas: { increment: 1 },
          ultimaMensagemEm: agora,
          ultimaMensagemClienteEm: agora,
          janelaAteEm: new Date(agora.getTime() + DIA_MS),
          ...(sinais.emergencia ? { prioridade: 'emergencia' as const } : {}),
        },
      });
      if (reabrir) {
        // Reabrir é mudança de controle: versaoControle invalida ações em voo. O filtro por
        // estado não sobrescreve uma transição concorrente (ex.: humano assumiu).
        await tx.conversation.updateMany({
          where: { id: conversationId, estado: 'ENCERRADA' },
          data: { estado: 'IA_ATIVA', versaoControle: { increment: 1 } },
        });
      }
      return criada;
    });

    await this.eventos.publicar('message.created', { conversationId, mensagem: paraMensagemDTO(msg) });
    const conversa = await this.publicarConversa(conversationId);

    const agendar =
      ev.tipoMensagem !== 'figurinha' && conversa.estado === 'IA_ATIVA' && (await this.settings.iaGlobalAtiva());
    if (agendar) {
      await this.agentTurn.add(
        'turn',
        { conversationId },
        { delay: this.debounceMs, jobId: `turn.${conversationId}.${Date.now()}` },
      );
    }
    this.logger.log(`mensagem ${ev.idExterno} ingerida (conversa ${conversationId}); turno ${agendar ? 'agendado' : 'não agendado'}`);
  }

  /**
   * Mensagem da conta conectada (fromMe). Pode ser o eco de um envio nosso (casa por idExterno,
   * ou por texto quando o worker de saída ainda não gravou o idExterno) ou algo digitado no
   * celular (vira Message do atendente). Nunca roda turno.
   */
  private async processarSaidaDoCelular(numeroId: string, conversationId: string, ev: EventoMensagem): Promise<void> {
    const jaExiste = await this.prisma.message.findUnique({
      where: { numeroId_idExterno: { numeroId, idExterno: ev.idExterno } },
      select: { id: true },
    });
    if (jaExiste) return; // eco confirmado por idExterno

    if (ev.tipoMensagem === 'texto' && ev.texto) {
      const alvo = ev.texto.trim();
      const candidatas = await this.prisma.message.findMany({
        where: {
          conversationId,
          autor: { in: ['ia', 'atendente', 'sistema'] },
          status: { in: ['enviando', 'enviada'] },
          idExterno: null,
          criadaEm: { gte: new Date(Date.now() - JANELA_ECO_MS) },
        },
        orderBy: { criadaEm: 'desc' },
        select: { id: true, texto: true },
        take: 20,
      });
      const pendente = candidatas.find((m) => m.texto?.trim() === alvo);
      if (pendente) {
        try {
          await this.prisma.message.update({ where: { id: pendente.id }, data: { idExterno: ev.idExterno } });
        } catch (e) {
          // o worker de saída gravou o mesmo idExterno entre a checagem e agora: segue como eco
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        }
        return;
      }
    }

    const agora = new Date();
    const msg = await this.prisma.message.create({
      data: {
        conversationId,
        numeroId,
        autor: 'atendente',
        tipo: ev.tipoMensagem,
        texto: this.textoDaEntrada(ev, 'fromMe'),
        status: 'enviada', // enviada pelo celular
        idExterno: ev.idExterno,
        criadaEm: agora,
      },
    });
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { ultimaMensagemEm: agora } });
    await this.eventos.publicar('message.created', { conversationId, mensagem: paraMensagemDTO(msg) });
    await this.publicarConversa(conversationId);
  }

  private textoDaEntrada(ev: EventoMensagem, origem: 'cliente' | 'fromMe' = 'cliente'): string | null {
    if (ev.tipoMensagem === 'texto') return ev.texto ?? '';
    if (ev.tipoMensagem === 'figurinha') return null;
    const base = TEXTO_MIDIA[ev.tipoMensagem];
    if (!base) return ev.texto ?? null;
    if (origem === 'fromMe') return ev.texto?.trim() || '[mídia enviada pelo celular]';
    const legenda = ev.texto?.trim();
    return legenda ? `${base}\n${legenda}` : base;
  }

  /** Recarrega a conversa e publica `conversation.updated`. */
  private async publicarConversa(conversationId: string) {
    const conv = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: INCLUDE_CONVERSA_ITEM,
    });
    await this.eventos.publicar('conversation.updated', { conversa: paraConversaItemDTO(conv) });
    return conv;
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, err: Error): void {
    this.logger.warn(`inbound job ${job?.id} falhou (tentativa ${job?.attemptsMade}): ${err.message}`);
  }
}
