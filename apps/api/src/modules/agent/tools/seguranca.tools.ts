import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { TEXTO_EMERGENCIA, TEXTO_INTERRUPCAO } from '@sales-hub/shared';
import { INCLUDE_CONVERSA_ITEM, paraConversaItemDTO, SETOR_EMERGENCIA } from '../../../common/mapeadores';
import { PrismaService } from '../../../prisma/prisma.service';
import { ATOR_SISTEMA, ControleService } from '../../controle/controle.service';
import { OutboundService } from '../../outbound/outbound.service';
import { EventosService } from '../../realtime/eventos.service';
import { OPCOES_AGENTE, type OpcoesAgente } from '../llm.types';
import { ResumoService } from '../resumo.service';
import { controleMudou, oportunidadeAberta, publicar, type ContextoTurno, type ResultadoFerramenta } from './contexto';

const ESPERA_SAIDA_PADRAO_MS = 15_000;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Transferência, emergência e interrupção (spec §9.6). Textos fixos saem como `autor sistema`. */
@Injectable()
export class SegurancaTools {
  private readonly logger = new Logger(SegurancaTools.name);
  private readonly esperaSaidaMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly saida: OutboundService,
    private readonly controle: ControleService,
    private readonly resumo: ResumoService,
    private readonly eventos: EventosService,
    @Optional() @Inject(OPCOES_AGENTE) opcoes?: OpcoesAgente,
  ) {
    this.esperaSaidaMs = opcoes?.esperaSaidaMs ?? ESPERA_SAIDA_PADRAO_MS;
  }

  /**
   * Transfere para um setor (ator sistema). Antes, espera as mensagens do turno saírem (a
   * despedida não pode ser cancelada pela própria transferência) e reconfere a versão: se uma
   * pessoa já assumiu, não transfere. Devolve false quando a garantia de parada barrou.
   */
  async transferir(ctx: ContextoTurno, motivo: string, destino = 'Comercial', aguardar: string[] = ctx.bolhasIds): Promise<boolean> {
    await this.aguardarSaida(aguardar);
    if (await controleMudou(this.prisma, ctx)) return false;
    const setor = await this.prisma.sector.findUnique({ where: { nome: destino } });
    if (!setor) throw new Error(`Setor ${destino} não encontrado`);
    await this.controle.transferir(ctx.conversationId, ATOR_SISTEMA, { setorId: setor.id }, motivo);
    await this.resumo.enfileirar(ctx.conversationId).catch((e) => this.logger.warn(`resumo: ${(e as Error).message}`));
    return true;
  }

  async transferirParaHumano(ctx: ContextoTurno, i: { motivo: string; destino?: string }): Promise<ResultadoFerramenta> {
    const ok = await this.transferir(ctx, i.motivo, i.destino ?? 'Comercial');
    return ok ? { ok: true, terminal: true, resultado: { transferido: true } } : { ok: false, abortado: true };
  }

  /** Emergência: texto oficial, prioridade, setor Suporte, tarefas comerciais suspensas, fim do turno. */
  async sinalizarEmergencia(ctx: ContextoTurno, i: { tipo: string; descricao: string }): Promise<ResultadoFerramenta> {
    // segurança: sai mesmo a contato restrito (o cliente acabou de pedir ajuda)
    await this.saida.criarMensagemSistema({ conversationId: ctx.conversationId, texto: TEXTO_EMERGENCIA, confirmadoRestrito: true });
    const c = await this.prisma.conversation.update({
      where: { id: ctx.conversationId },
      data: { prioridade: 'emergencia' },
      include: INCLUDE_CONVERSA_ITEM,
    });
    await publicar(this.eventos, 'conversation.updated', { conversa: paraConversaItemDTO(c) });
    const setor = await this.prisma.sector.findUnique({ where: { nome: SETOR_EMERGENCIA } });
    if (setor) {
      await this.controle.transferir(ctx.conversationId, ATOR_SISTEMA, { setorId: setor.id }, `Emergência (${i.tipo}): ${i.descricao}`);
    }
    const op = await oportunidadeAberta(this.prisma, ctx.contactId);
    if (op) {
      const tarefas = await this.prisma.task.findMany({
        where: { opportunityId: op.id, status: 'aberta', tipo: { in: ['cotacao', 'retorno', 'encaminhar_contratacao'] } },
        select: { id: true },
      });
      await this.prisma.task.updateMany({ where: { id: { in: tarefas.map((t) => t.id) } }, data: { status: 'cancelada' } });
      for (const t of tarefas) await publicar(this.eventos, 'task.updated', { taskId: t.id, opportunityId: op.id });
    }
    await this.resumo.enfileirar(ctx.conversationId).catch(() => undefined);
    return { ok: true, terminal: true, resultado: { emergencia: i.tipo } };
  }

  /**
   * Interrupção: numa transação trava a conversa, revoga o consentimento e incrementa a versão
   * (nenhuma automática sai depois); cancela as pendentes; envia a confirmação fixa (restrita).
   */
  async registrarInterrupcao(ctx: ContextoTurno): Promise<ResultadoFerramenta> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${ctx.conversationId} FOR UPDATE`;
      const em = new Date();
      await tx.consent.upsert({
        where: { contactId: ctx.contactId },
        create: { contactId: ctx.contactId, status: 'revogado', em, mensagemOrigemId: ctx.mensagemOrigemId },
        update: { status: 'revogado', em, mensagemOrigemId: ctx.mensagemOrigemId },
      });
      await tx.conversation.update({ where: { id: ctx.conversationId }, data: { versaoControle: { increment: 1 } } });
    });
    await this.saida.cancelarAutomaticasPendentes(ctx.conversationId, 'Contato pediu para parar as mensagens');
    await this.saida.criarMensagemSistema({ conversationId: ctx.conversationId, texto: TEXTO_INTERRUPCAO, confirmadoRestrito: true });
    return { ok: true, terminal: true, resultado: { interrompido: true } };
  }

  /** Espera as mensagens saírem da fila (enviadas ou canceladas), com teto. */
  private async aguardarSaida(ids: string[]): Promise<void> {
    if (!ids.length || this.esperaSaidaMs <= 0) return;
    const fim = Date.now() + this.esperaSaidaMs;
    while (Date.now() < fim) {
      const n = await this.prisma.message.count({ where: { id: { in: ids }, status: { in: ['pendente', 'enviando'] } } });
      if (n === 0) return;
      await esperar(250);
    }
  }
}
