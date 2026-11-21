import { Injectable } from '@nestjs/common';
import type { Prisma, Preocupacao, TipoObjecao } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { FunilService } from '../../crm/funil.service';
import { EventosService } from '../../realtime/eventos.service';
import { marcaIa, oportunidadeAberta, publicarOportunidade, type ContextoTurno, type ResultadoFerramenta } from './contexto';

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** Coleta de dados (spec §9.3): contato, item de interesse, interesse e objeção, com marcação "preenchido pela IA". */
@Injectable()
export class CrmTools {
  constructor(
    private readonly prisma: PrismaService,
    private readonly funil: FunilService,
    private readonly eventos: EventosService,
  ) {}

  async atualizarContato(
    ctx: ContextoTurno,
    i: { nome?: string; cidade?: string; uf?: string; melhorHorario?: string },
  ): Promise<ResultadoFerramenta> {
    const c = await this.prisma.contact.findUniqueOrThrow({ where: { id: ctx.contactId } });
    const data: Prisma.ContactUpdateInput = {};
    const campos: string[] = [];
    if (i.nome) {
      data.nome = i.nome;
      campos.push('nome');
    }
    if (i.cidade) {
      data.cidade = i.cidade;
      campos.push('cidade');
    }
    if (i.uf) {
      data.uf = i.uf.toUpperCase();
      campos.push('uf');
    }
    const extra = i.melhorHorario ? { melhorHorario: { valor: i.melhorHorario } } : {};
    if (i.melhorHorario) campos.push('melhorHorario');
    if (!campos.length) return { ok: false, erro: 'Informe ao menos um campo.' };
    data.camposIa = json(marcaIa(ctx, campos, c.camposIa, extra));
    await this.prisma.contact.update({ where: { id: c.id }, data });
    return { ok: true, resultado: { atualizados: campos } };
  }

  async registrarItem(
    ctx: ContextoTurno,
    i: { categoria?: string; descricao?: string; quantidade?: number; itemId?: string },
  ): Promise<ResultadoFerramenta> {
    const dados = { categoria: i.categoria, descricao: i.descricao, quantidade: i.quantidade };
    const definidos = Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== undefined));
    const campos = Object.keys(definidos);
    if (!campos.length) return { ok: false, erro: 'Informe ao menos um campo (categoria, descricao ou quantidade).' };
    let alvo = i.itemId
      ? await this.prisma.interestItem.findFirst({ where: { id: i.itemId, contactId: ctx.contactId } })
      : null;
    if (i.itemId && !alvo) return { ok: false, erro: 'Item de interesse não encontrado para este contato.' };
    if (!alvo) {
      // completa o único item da mesma categoria (ou ainda sem categoria) cuja descrição não conflita,
      // para não duplicar ao longo da conversa
      const doContato = await this.prisma.interestItem.findMany({ where: { contactId: ctx.contactId } });
      const mesmaCategoria = (c: string | null) =>
        !i.categoria || !c || c.trim().toLowerCase() === i.categoria.trim().toLowerCase();
      const candidatos = doContato.filter((it) => mesmaCategoria(it.categoria));
      const unico = candidatos.length === 1 ? candidatos[0]! : null;
      alvo = unico && (!unico.descricao || !i.descricao || unico.descricao === i.descricao) ? unico : null;
    }
    const item = alvo
      ? await this.prisma.interestItem.update({
          where: { id: alvo.id },
          data: { ...definidos, camposIa: json(marcaIa(ctx, campos, alvo.camposIa)) },
        })
      : await this.prisma.interestItem.create({
          data: { contactId: ctx.contactId, ...definidos, camposIa: json(marcaIa(ctx, campos, {})) },
        });
    ctx.itemRecenteId = item.id;
    const op = await oportunidadeAberta(this.prisma, ctx.contactId);
    if (op && !op.itemId) {
      await this.prisma.opportunity.update({ where: { id: op.id }, data: { itemId: item.id } });
      await publicarOportunidade(this.prisma, this.eventos, op.id);
    }
    return { ok: true, resultado: { itemId: item.id } };
  }

  async registrarInteresse(
    ctx: ContextoTurno,
    i: {
      produto?: string;
      solucaoAtual?: string;
      momentoCompra?: string;
      preocupacao?: Preocupacao;
      prazoDecisao?: string;
      itemId?: string;
      justificativa: string;
    },
  ): Promise<ResultadoFerramenta> {
    if (i.produto) {
      // o produto é o slug de um item aprovado do catálogo; nada fora dele
      const existe = await this.prisma.product.findFirst({ where: { slug: i.produto, aprovado: true }, select: { id: true } });
      if (!existe) {
        const slugs = await this.prisma.product.findMany({ where: { aprovado: true }, select: { slug: true }, orderBy: { slug: 'asc' } });
        return { ok: false, erro: `Produto "${i.produto}" não está no catálogo. Use um destes slugs: ${slugs.map((p) => p.slug).join(', ') || 'nenhum'}.` };
      }
    }
    let itemId = i.itemId ?? ctx.itemRecenteId ?? null;
    if (itemId && !(await this.prisma.interestItem.findFirst({ where: { id: itemId, contactId: ctx.contactId }, select: { id: true } }))) {
      return { ok: false, erro: 'Item de interesse não encontrado para este contato.' };
    }
    if (!itemId) {
      const its = await this.prisma.interestItem.findMany({ where: { contactId: ctx.contactId }, select: { id: true } });
      if (its.length === 1) itemId = its[0]!.id;
    }
    const campos = { produto: i.produto, solucaoAtual: i.solucaoAtual, momentoCompra: i.momentoCompra, preocupacao: i.preocupacao, prazoDecisao: i.prazoDecisao };
    const definidos = Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined));
    const nomes = Object.keys(definidos);

    const abertas = await this.prisma.opportunity.findMany({
      where: { contactId: ctx.contactId, fechadaEm: null },
      orderBy: { criadaEm: 'desc' },
    });
    const op =
      abertas.find((o) => itemId && o.itemId === itemId) ??
      abertas.find((o) => !o.itemId) ??
      (itemId ? undefined : abertas[0]);

    if (op) {
      await this.prisma.opportunity.update({
        where: { id: op.id },
        data: { ...definidos, ...(itemId && !op.itemId ? { itemId } : {}), camposIa: json(marcaIa(ctx, nomes, op.camposIa)) },
      });
      await publicarOportunidade(this.prisma, this.eventos, op.id);
      return { ok: true, resultado: { oportunidadeId: op.id, etapa: op.etapa } };
    }

    const nova = await this.prisma.$transaction(async (tx) => {
      const o = await tx.opportunity.create({
        data: {
          contactId: ctx.contactId,
          itemId,
          etapa: 'novo_lead',
          ultimoContatoClienteEm: new Date(),
          ...definidos,
          camposIa: json(marcaIa(ctx, nomes, {})),
        },
      });
      await tx.opportunityEvent.create({
        data: { opportunityId: o.id, de: null, para: 'novo_lead', ator: 'sistema', justificativa: 'Oportunidade criada no atendimento', mensagemOrigemId: ctx.mensagemOrigemId },
      });
      return o;
    });
    const card = await this.funil.mover({
      opportunityId: nova.id,
      para: 'em_atendimento',
      ator: 'ia',
      justificativa: i.justificativa,
      mensagemOrigemId: ctx.mensagemOrigemId,
    });
    return { ok: true, resultado: { oportunidadeId: nova.id, etapa: card.etapa } };
  }

  async registrarObjecao(ctx: ContextoTurno, i: { tipo: TipoObjecao; descricao: string }): Promise<ResultadoFerramenta> {
    const op = await oportunidadeAberta(this.prisma, ctx.contactId);
    if (!op) return { ok: false, erro: 'Não há oportunidade aberta. Registre o interesse antes com registrar_interesse.' };
    const o = await this.prisma.objection.create({
      data: { opportunityId: op.id, tipo: i.tipo, descricao: i.descricao, mensagemOrigemId: ctx.mensagemOrigemId },
    });
    return { ok: true, resultado: { objecaoId: o.id } };
  }
}
