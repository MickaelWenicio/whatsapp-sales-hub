import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type StatusMensagem } from '@prisma/client';
import {
  decidirEnvio,
  mesmoNumero,
  type DecisaoEnvio,
  type EstadoEnvio,
  type EventoTempoReal,
} from '@sales-hub/shared';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '../../queue/queue.constants';
import { CHANNEL_PORT, type ChannelPort } from '../channel/channel.port';
import { EventosService } from '../realtime/eventos.service';
import { SettingsService } from '../security/settings.service';
import { TEXTO_MOTIVO_ENVIO, textoFalhaCanal } from './outbound.motivos';
import type { JobEnvio } from './outbound.service';

export type { JobEnvio } from './outbound.service';

/** Uma mensagem por vez, no máximo 1 a cada 1,5 s (protege o número contra bloqueio por rajada). */
export const OPCOES_WORKER_SAIDA = { concurrency: 1, limiter: { max: 1, duration: 1500 } };

/** Recibos simulados da demonstração (não passam pela fila). */
const SIMULACAO_ENTREGUE_MS = 1500;
const SIMULACAO_LIDA_MS = 4000;

const INCLUDE_ENVIO = {
  numero: true,
  conversation: { include: { contact: { include: { consentimento: true } } } },
} satisfies Prisma.MessageInclude;

type MensagemEnvio = Prisma.MessageGetPayload<{ include: typeof INCLUDE_ENVIO }>;
type Db = Prisma.TransactionClient | PrismaService;

/** Resultado da revalidação sob trava (já aplicado no banco). */
type Final =
  | { acao: 'nada' }
  | { acao: 'enviar'; msg: MensagemEnvio; citarId?: string }
  | Exclude<DecisaoEnvio, { acao: 'enviar' }>;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Consumidor de `QUEUES.OUTBOUND` (só no papel worker). Garantia de parada (spec §8.3):
 * 1. carrega a mensagem; se não está `pendente`, nada (idempotência);
 * 2. pré-checagem com `decidirEnvio` (sem trava) só para decidir se mostra "digitando";
 * 3. presença `composing` (sem aguardar) + `agent.typing`, e espera `digitandoMs`;
 * 4. transação com `SELECT ... FOR UPDATE` na conversa: recalcula `decidirEnvio` com dados frescos
 *    e aplica a decisão (`enviando` | `cancelada` | `falhou` | `enviada` simulada) ainda sob a trava;
 * 5. só com `enviando` gravado chama o canal; grava `idExterno` logo em seguida.
 * Toda mudança de controle (ControleService) incrementa `versaoControle` sob a mesma trava, então
 * nenhuma mensagem automática decidida depois dela chega ao canal.
 */
@Processor(QUEUES.OUTBOUND, OPCOES_WORKER_SAIDA)
export class OutboundProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(OutboundProcessor.name);
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CHANNEL_PORT) private readonly channel: ChannelPort,
    private readonly settings: SettingsService,
    private readonly eventos: EventosService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<JobEnvio>): Promise<void> {
    const { messageId } = job.data;
    const digitandoMs = Math.max(0, Number(job.data.digitandoMs) || 0);

    // 1. carregar; idempotência
    const msg = await this.carregar(this.prisma, messageId);
    if (!msg || msg.status !== 'pendente' || !this.enviavel(msg)) return;
    const conversationId = msg.conversationId;
    const instancia = msg.numero.instanciaEvolution;
    const para = msg.conversation.contact.e164;
    const ia = msg.autor === 'ia';

    // 2. pré-checagem (a decisão que vale é a do passo 4)
    const pre = decidirEnvio(await this.estadoEnvio(msg));

    // 3. "digitando"
    let compondo = false;
    let digitandoPublicado = false;
    if (pre.acao === 'enviar' && digitandoMs > 0) {
      this.presenca(instancia, para, 'composing', digitandoMs);
      compondo = true;
      if (ia) {
        await this.publicar('agent.typing', { conversationId, ativo: true });
        digitandoPublicado = true;
      }
      await esperar(digitandoMs);
    }

    // 4. revalidação sob trava, com a decisão já aplicada no banco
    const final = await this.revalidarEAplicar(messageId);

    if (final.acao === 'enviar') {
      // 5. envio fora da transação; erro do canal vira `falhou` (sem relançar: não duplica)
      let status: StatusMensagem = 'enviada';
      let motivoFalha: string | null = null;
      let idExterno: string | null = null;
      try {
        // dados relidos sob a trava (passo 4)
        const r = await this.channel.enviarTexto(
          final.msg.numero.instanciaEvolution,
          final.msg.conversation.contact.e164,
          final.msg.texto ?? '',
          final.citarId ? { citarId: final.citarId } : undefined,
        );
        idExterno = r?.idExterno?.trim() || null;
      } catch (e) {
        status = 'falhou';
        motivoFalha = textoFalhaCanal(e);
      }
      if (status === 'enviada') await this.gravarEnviada(messageId, idExterno);
      else await this.prisma.message.update({ where: { id: messageId }, data: { status, motivoFalha } });
      if (digitandoPublicado) await this.publicar('agent.typing', { conversationId, ativo: false });
      await this.publicar('message.updated', { conversationId, mensagemId: messageId, status, motivoFalha });
      return;
    }

    // não saiu: desliga o "digitando" no WhatsApp e no painel
    if (compondo) this.presenca(instancia, para, 'paused', 0);
    if (digitandoPublicado) await this.publicar('agent.typing', { conversationId, ativo: false });
    if (final.acao === 'nada') return;

    if (final.acao === 'simular') {
      await this.publicar('message.updated', { conversationId, mensagemId: messageId, status: 'enviada', motivoFalha: null });
      this.agendarRecibosSimulados(conversationId, messageId);
      return;
    }
    const status: StatusMensagem = final.acao === 'cancelar' ? 'cancelada' : 'falhou';
    await this.publicar('message.updated', {
      conversationId,
      mensagemId: messageId,
      status,
      motivoFalha: TEXTO_MOTIVO_ENVIO[final.motivo],
    });
  }

  /** Passo 4: trava a linha da conversa, relê tudo, decide e grava a transição de status. */
  private revalidarEAplicar(messageId: string): Promise<Final> {
    return this.prisma.$transaction(async (tx): Promise<Final> => {
      const alvo = await tx.message.findUnique({ where: { id: messageId }, select: { conversationId: true } });
      if (!alvo) return { acao: 'nada' };
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${alvo.conversationId} FOR UPDATE`;

      const msg = await this.carregar(tx, messageId);
      if (!msg || msg.status !== 'pendente') return { acao: 'nada' };
      const decisao = decidirEnvio(await this.estadoEnvio(msg));

      // transição condicional: se outra operação já tirou a mensagem de `pendente`, não faz nada
      const transicionar = async (data: Prisma.MessageUpdateManyMutationInput): Promise<boolean> => {
        const r = await tx.message.updateMany({ where: { id: messageId, status: 'pendente' }, data });
        return r.count === 1;
      };

      switch (decisao.acao) {
        case 'enviar': {
          const citada = msg.citadaId
            ? await tx.message.findUnique({ where: { id: msg.citadaId }, select: { idExterno: true } })
            : null;
          if (!(await transicionar({ status: 'enviando' }))) return { acao: 'nada' };
          return { acao: 'enviar', msg, citarId: citada?.idExterno ?? undefined };
        }
        case 'simular':
          return (await transicionar({ status: 'enviada', motivoFalha: null })) ? decisao : { acao: 'nada' };
        case 'cancelar':
          return (await transicionar({ status: 'cancelada', motivoFalha: TEXTO_MOTIVO_ENVIO[decisao.motivo] }))
            ? decisao
            : { acao: 'nada' };
        case 'falhar':
          return (await transicionar({ status: 'falhou', motivoFalha: TEXTO_MOTIVO_ENVIO[decisao.motivo] }))
            ? decisao
            : { acao: 'nada' };
      }
    });
  }

  private carregar(db: Db, id: string): Promise<MensagemEnvio | null> {
    return db.message.findUnique({ where: { id }, include: INCLUDE_ENVIO });
  }

  /** Só texto de saída vai para o canal (nota interna, evento e mensagem do cliente nunca). */
  private enviavel(m: MensagemEnvio): boolean {
    return m.autor !== 'cliente' && m.tipo === 'texto' && !!m.texto;
  }

  private demoMode(): boolean {
    const v = this.config.get<unknown>('DEMO_MODE');
    return v === true || v === 'true' || v === '1';
  }

  private async estadoEnvio(m: MensagemEnvio): Promise<EstadoEnvio> {
    const conv = m.conversation;
    const demoMode = this.demoMode();
    const [iaGlobalAtiva, permitidos] = await Promise.all([
      this.settings.iaGlobalAtiva(),
      demoMode ? this.settings.numerosPermitidos() : Promise.resolve<string[]>([]),
    ]);
    return {
      // texto do sistema com versão (contingência) é automático; sem versão (emergência, interrupção), não
      automatica: m.autor === 'ia' || (m.autor === 'sistema' && m.versaoControle != null),
      estadoConversa: conv.estado,
      versaoMensagem: m.versaoControle,
      versaoAtual: conv.versaoControle,
      iaGlobalAtiva,
      interrupcaoRegistrada: conv.contact.consentimento?.status === 'revogado',
      confirmadoRestrito: m.confirmadoRestrito,
      demoMode,
      destinoPermitido: permitidos.some((p) => mesmoNumero(p, conv.contact.e164)),
      numeroConectado: m.numero.estado === 'conectado',
    };
  }

  /** Grava `enviada` + `idExterno` logo após o canal responder (o eco da entrada casa por ele). */
  private async gravarEnviada(id: string, idExterno: string | null): Promise<void> {
    try {
      await this.prisma.message.update({ where: { id }, data: { status: 'enviada', idExterno, motivoFalha: null } });
    } catch (e) {
      if (idExterno && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        this.logger.warn(`idExterno ${idExterno} já existe em outra mensagem; gravando ${id} sem ele`);
        await this.prisma.message.update({ where: { id }, data: { status: 'enviada', motivoFalha: null } });
        return;
      }
      throw e;
    }
  }

  /** Presença é cosmética: dispara sem aguardar e ignora erro (a Evolution segura a resposta pelo `delay`). */
  private presenca(instancia: string, para: string, estado: 'composing' | 'paused', ms: number): void {
    void Promise.resolve()
      .then(() => this.channel.enviarPresenca(instancia, para, estado, ms))
      .catch(() => undefined);
  }

  /** Demo: `entregue` (+1,5 s) e `lida` (+4 s) por timer no próprio worker; perder num reinício é aceitável. */
  private agendarRecibosSimulados(conversationId: string, messageId: string): void {
    this.agendar(SIMULACAO_ENTREGUE_MS, () => this.avancarStatus(conversationId, messageId, ['enviada'], 'entregue'));
    this.agendar(SIMULACAO_LIDA_MS, () => this.avancarStatus(conversationId, messageId, ['enviada', 'entregue'], 'lida'));
  }

  private agendar(ms: number, f: () => Promise<void>): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      f().catch((e) => this.logger.warn(`recibo simulado falhou: ${(e as Error).message}`));
    }, ms);
    this.timers.add(t);
  }

  private async avancarStatus(
    conversationId: string,
    id: string,
    de: StatusMensagem[],
    para: StatusMensagem,
  ): Promise<void> {
    const r = await this.prisma.message.updateMany({ where: { id, status: { in: de } }, data: { status: para } });
    if (r.count === 1) await this.publicar('message.updated', { conversationId, mensagemId: id, status: para, motivoFalha: null });
  }

  onModuleDestroy(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<JobEnvio> | undefined, err: Error): Promise<void> {
    if (!job) return;
    const tentativas = job.opts.attempts ?? 1;
    this.logger.warn(`saída ${job.id} falhou (tentativa ${job.attemptsMade}/${tentativas}): ${err.message}`);
    if (job.attemptsMade < tentativas) return;
    // esgotou as tentativas antes de chegar ao canal: deixa visível no painel ("Tentar de novo")
    try {
      const m = await this.prisma.message.findUnique({ where: { id: job.data.messageId }, select: { conversationId: true } });
      const r = await this.prisma.message.updateMany({
        where: { id: job.data.messageId, status: 'pendente' },
        data: { status: 'falhou', motivoFalha: `Erro interno no envio: ${err.message}`.slice(0, 500) },
      });
      if (m && r.count === 1) {
        await this.publicar('message.updated', {
          conversationId: m.conversationId,
          mensagemId: job.data.messageId,
          status: 'falhou',
          motivoFalha: `Erro interno no envio: ${err.message}`.slice(0, 500),
        });
      }
    } catch (e) {
      this.logger.warn(`não marcou ${job.data.messageId} como falhou: ${(e as Error).message}`);
    }
  }

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
