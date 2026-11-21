import { Injectable } from '@nestjs/common';
import { podeMover, type Etapa } from '@sales-hub/shared';
import { INCLUDE_CONVERSA_ITEM, paraConversaItemDTO } from '../../../common/mapeadores';
import { PrismaService } from '../../../prisma/prisma.service';
import { FunilService } from '../../crm/funil.service';
import { EventosService } from '../../realtime/eventos.service';
import {
  oportunidadeAberta,
  primeiroAtendente,
  publicar,
  publicarOportunidade,
  type ContextoTurno,
  type ResultadoFerramenta,
} from './contexto';

const PRAZO_COTACAO_MS = 2 * 3600_000;
const SEM_OPORTUNIDADE = 'Não há oportunidade aberta. Registre o interesse antes com registrar_interesse.';

/** Funil (spec §9.3/§9.4.1): o modelo propõe, o FunilService decide as arestas e guardas. */
@Injectable()
export class FunilTools {
  constructor(
    private readonly prisma: PrismaService,
    private readonly funil: FunilService,
    private readonly eventos: EventosService,
  ) {}

  async moverEtapa(ctx: ContextoTurno, i: { etapa: Etapa; motivoPerda?: string; justificativa: string }): Promise<ResultadoFerramenta> {
    const op = await oportunidadeAberta(this.prisma, ctx.contactId);
    if (!op) return { ok: false, erro: SEM_OPORTUNIDADE };
    const card = await this.funil.mover({
      opportunityId: op.id,
      para: i.etapa,
      ator: 'ia',
      justificativa: i.justificativa,
      mensagemOrigemId: ctx.mensagemOrigemId,
      motivoPerda: i.motivoPerda,
    });
    return { ok: true, resultado: { etapa: card.etapa } };
  }

  async solicitarCotacao(ctx: ContextoTurno, i: { observacoes?: string; justificativa: string }): Promise<ResultadoFerramenta> {
    const op = await oportunidadeAberta(this.prisma, ctx.contactId);
    if (!op) return { ok: false, erro: SEM_OPORTUNIDADE };
    const ja = await this.prisma.task.findFirst({ where: { opportunityId: op.id, tipo: 'cotacao', status: 'aberta' } });
    if (ja) return { ok: true, resultado: { tarefaId: ja.id, jaExistia: true, etapa: op.etapa } };

    const resp = await primeiroAtendente(this.prisma);
    const contato = await this.prisma.contact.findUniqueOrThrow({ where: { id: ctx.contactId } });
    const item = op.itemId ? await this.prisma.interestItem.findUnique({ where: { id: op.itemId } }) : null;
    const descItem = item ? [item.categoria, item.descricao].filter(Boolean).join(', ') || null : null;
    const prazoEm = new Date(Date.now() + PRAZO_COTACAO_MS);
    const tarefa = await this.prisma.task.create({
      data: {
        tipo: 'cotacao',
        titulo: `Cotação para ${contato.nome ?? 'novo contato'}${descItem ? ` (${descItem})` : ''}`,
        opportunityId: op.id,
        conversationId: ctx.conversationId,
        responsavelId: resp?.id ?? null,
        prazoEm,
      },
    });
    await this.prisma.opportunity.update({
      where: { id: op.id },
      data: { responsavelId: op.responsavelId ?? resp?.id ?? null, proximaAcao: 'Enviar cotação', proximaAcaoEm: prazoEm },
    });
    if (i.observacoes) {
      const conv = await this.prisma.conversation.findUniqueOrThrow({ where: { id: ctx.conversationId }, select: { numeroId: true } });
      await this.prisma.message.create({
        data: {
          conversationId: ctx.conversationId,
          numeroId: conv.numeroId,
          autor: 'sistema',
          tipo: 'nota_interna',
          texto: `Cotação solicitada pela IA: ${i.observacoes}`,
        },
      });
    }
    let etapa = op.etapa;
    if (op.etapa !== 'aguardando_cotacao' && podeMover(op.etapa, 'aguardando_cotacao', 'ia').ok) {
      etapa = (
        await this.funil.mover({
          opportunityId: op.id,
          para: 'aguardando_cotacao',
          ator: 'ia',
          justificativa: i.justificativa,
          mensagemOrigemId: ctx.mensagemOrigemId,
        })
      ).etapa;
    } else {
      await publicarOportunidade(this.prisma, this.eventos, op.id);
    }
    await publicar(this.eventos, 'task.updated', { taskId: tarefa.id, opportunityId: op.id });
    return { ok: true, resultado: { tarefaId: tarefa.id, responsavel: resp?.nome ?? null, etapa } };
  }

  async sinalizarIntencao(ctx: ContextoTurno, i: { sinais: string; justificativa: string }): Promise<ResultadoFerramenta> {
    const op = await oportunidadeAberta(this.prisma, ctx.contactId);
    if (!op) return { ok: false, erro: SEM_OPORTUNIDADE };
    const conv = await this.prisma.conversation.findUniqueOrThrow({ where: { id: ctx.conversationId } });
    if (conv.prioridade !== 'emergencia') {
      const c = await this.prisma.conversation.update({
        where: { id: conv.id },
        data: { prioridade: 'alta' },
        include: INCLUDE_CONVERSA_ITEM,
      });
      await publicar(this.eventos, 'conversation.updated', { conversa: paraConversaItemDTO(c) });
    }
    const resp = op.responsavelId ? { id: op.responsavelId } : await primeiroAtendente(this.prisma);
    await this.prisma.opportunity.update({ where: { id: op.id }, data: { prioridade: 'alta', responsavelId: op.responsavelId ?? resp?.id ?? null } });
    const contato = await this.prisma.contact.findUniqueOrThrow({ where: { id: ctx.contactId } });
    let tarefa = await this.prisma.task.findFirst({ where: { opportunityId: op.id, tipo: 'encaminhar_contratacao', status: 'aberta' } });
    tarefa ??= await this.prisma.task.create({
      data: {
        tipo: 'encaminhar_contratacao',
        titulo: `Encaminhar contratação de ${contato.nome ?? 'novo contato'}: ${i.sinais}`.slice(0, 180),
        opportunityId: op.id,
        conversationId: ctx.conversationId,
        responsavelId: resp?.id ?? null,
        prazoEm: new Date(Date.now() + PRAZO_COTACAO_MS),
      },
    });
    let etapa = op.etapa;
    if (op.etapa !== 'contratacao_em_andamento' && podeMover(op.etapa, 'contratacao_em_andamento', 'ia').ok) {
      etapa = (
        await this.funil.mover({
          opportunityId: op.id,
          para: 'contratacao_em_andamento',
          ator: 'ia',
          justificativa: i.justificativa,
          mensagemOrigemId: ctx.mensagemOrigemId,
        })
      ).etapa;
    } else {
      await publicarOportunidade(this.prisma, this.eventos, op.id);
    }
    await publicar(this.eventos, 'task.updated', { taskId: tarefa.id, opportunityId: op.id });
    return { ok: true, resultado: { tarefaId: tarefa.id, etapa } };
  }
}
