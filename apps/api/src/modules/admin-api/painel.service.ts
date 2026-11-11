import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  ETAPAS,
  ehNumeroFicticio,
  formatarTelefoneExibicao,
  mesmoNumero,
  normalizarTelefoneBr,
  type CamposIaDTO,
  type ConversaDetalheDTO,
  type ListaConversasDTO,
  type ListaMensagensDTO,
  type MensagemDTO,
  type OportunidadesPorEtapaDTO,
  type TrilhaItemDTO,
  type VisaoGeralDTO,
} from '@sales-hub/shared';
import {
  INCLUDE_CONVERSA_ITEM,
  INCLUDE_OPORTUNIDADE_CARD,
  paraConversaItemDTO,
  paraMensagemDTO,
  paraOportunidadeCardDTO,
  paraTrilhaAcaoDTO,
  paraTrilhaControleDTO,
  paraTrilhaEtapaDTO,
} from '../../common/mapeadores';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '../../queue/queue.constants';
import { CHANNEL_PORT, type ChannelPort, type InboundJob } from '../channel/channel.port';
import { NumerosService } from '../channel/numeros.service';
import { ControleService } from '../controle/controle.service';
import { OutboundService } from '../outbound/outbound.service';
import { EventosService } from '../realtime/eventos.service';
import { SettingsService } from '../security/settings.service';
import type { Queue } from 'bullmq';

const textoSchema = z.object({ texto: z.string().trim().min(1).max(4096) });
const envioSchema = textoSchema.extend({
  assumir: z.boolean(),
  confirmarRestrito: z.boolean().optional(),
});
const campos = (v: unknown): CamposIaDTO =>
  (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as CamposIaDTO;
export function validar<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  return result.data;
}
function limite(value: unknown, padrao: number, max: number): number {
  if (value === undefined || value === '') return padrao;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max)
    throw new BadRequestException(`limite deve estar entre 1 e ${max}`);
  return n;
}

@Injectable()
export class PainelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly controle: ControleService,
    private readonly saida: OutboundService,
    private readonly eventos: EventosService,
    private readonly settings: SettingsService,
    private readonly numeros: NumerosService,
    @Inject(CHANNEL_PORT) private readonly channel: ChannelPort,
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.INBOUND) private readonly inbound: Queue<InboundJob>,
  ) {}

  private async conversa(id: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id },
      include: INCLUDE_CONVERSA_ITEM,
    });
    if (!conv) throw new NotFoundException('Conversa não encontrada');
    return conv;
  }

  async listar(
    query: Record<string, string | undefined>,
    actorId: string,
  ): Promise<ListaConversasDTO> {
    const filtro = validar(
      z.enum([
        'todas',
        'nao_lidas',
        'ia',
        'aguardando_humano',
        'minhas',
        'intencao',
        'prioridade',
        'encerradas',
      ]),
      query.filtro ?? 'todas',
    );
    const take = limite(query.limite, 30, 50);
    const where: Prisma.ConversationWhereInput = {};
    if (filtro === 'encerradas') where.estado = 'ENCERRADA';
    else if (filtro !== 'todas') where.estado = { not: 'ENCERRADA' };
    if (filtro === 'nao_lidas') where.naoLidas = { gt: 0 };
    if (filtro === 'ia') where.estado = 'IA_ATIVA';
    if (filtro === 'aguardando_humano')
      where.estado = { in: ['AGUARDANDO_ESPECIALISTA', 'IA_PAUSADA'] };
    if (filtro === 'minhas') where.responsavelId = actorId;
    if (filtro === 'intencao')
      where.contact = {
        oportunidades: { some: { etapa: 'contratacao_em_andamento', fechadaEm: null } },
      };
    if (filtro === 'prioridade') where.prioridade = { in: ['alta', 'emergencia'] };
    const busca = query.busca?.trim();
    if (busca)
      where.AND = [
        {
          OR: [
            { contact: { nome: { contains: busca, mode: 'insensitive' } } },
            {
              contact: {
                e164: { contains: busca.replace(/[^\d+]/g, '') || busca, mode: 'insensitive' },
              },
            },
            { mensagens: { some: { texto: { contains: busca, mode: 'insensitive' } } } },
          ],
        },
      ];
    const rows = await this.prisma.conversation.findMany({
      where,
      include: INCLUDE_CONVERSA_ITEM,
      orderBy: [
        { prioridade: 'desc' },
        { ultimaMensagemEm: { sort: 'desc', nulls: 'last' } },
        { id: 'desc' },
      ],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, take);
    return {
      itens: page.map((c) => ({
        ...paraConversaItemDTO(c),
        ficticio: c.origemDemo != null || ehNumeroFicticio(c.contact.e164),
        temDadosDemo: c.origemDemo != null,
      })),
      proximoCursor: rows.length > take ? page.at(-1)!.id : null,
    };
  }

  async detalhe(id: string): Promise<ConversaDetalheDTO> {
    const conversa = await this.conversa(id);
    const [contact, resumo, tarefas] = await Promise.all([
      this.prisma.contact.findUniqueOrThrow({
        where: { id: conversa.contactId },
        include: {
          consentimento: true,
          itens: { orderBy: { createdAt: 'asc' } },
          oportunidades: {
            where: { fechadaEm: null },
            orderBy: { criadaEm: 'desc' },
            take: 1,
            include: { responsavel: { select: { id: true, nome: true } }, objecoes: true },
          },
        },
      }),
      this.prisma.conversationSummary.findUnique({ where: { conversationId: id } }),
      this.prisma.task.findMany({
        where: { conversationId: id, status: 'aberta' },
        include: { responsavel: { select: { id: true, nome: true } } },
        orderBy: { prazoEm: 'asc' },
      }),
    ]);
    const op = contact.oportunidades[0];
    const vencida = (d: Date | null) => d !== null && d.getTime() < Date.now();
    return {
      conversa: {
        ...paraConversaItemDTO(conversa),
        ...{
          ficticio: conversa.origemDemo != null || ehNumeroFicticio(conversa.contact.e164),
          temDadosDemo: conversa.origemDemo != null,
        },
      },
      contato: {
        id: contact.id,
        nome: contact.nome,
        e164: contact.e164,
        telefoneExibicao: formatarTelefoneExibicao(contact.e164),
        cidade: contact.cidade,
        uf: contact.uf,
        origem: contact.origem,
        statusCliente: contact.statusCliente,
        camposIa: campos(contact.camposIa),
      },
      itens: contact.itens.map((it) => ({
        id: it.id,
        categoria: it.categoria,
        descricao: it.descricao,
        quantidade: it.quantidade,
        camposIa: campos(it.camposIa),
      })),
      oportunidade: op
        ? {
            id: op.id,
            etapa: op.etapa,
            etapaDesde: op.etapaDesde.toISOString(),
            produto: op.produto,
            itemId: op.itemId,
            responsavel: op.responsavel,
            proximaAcao: op.proximaAcao,
            proximaAcaoEm: op.proximaAcaoEm?.toISOString() ?? null,
            vencida: vencida(op.proximaAcaoEm),
            prioridade: op.prioridade,
            solucaoAtual: op.solucaoAtual,
            momentoCompra: op.momentoCompra,
            preocupacao: op.preocupacao,
            prazoDecisao: op.prazoDecisao,
            camposIa: campos(op.camposIa),
            objecoes: op.objecoes.map((o) => ({
              id: o.id,
              tipo: o.tipo,
              descricao: o.descricao,
              mensagemOrigemId: o.mensagemOrigemId,
              criadaEm: o.criadaEm.toISOString(),
            })),
          }
        : null,
      resumo: resumo
        ? {
            querOQue: resumo.querOQue,
            jaInformou: resumo.jaInformou,
            objecao: resumo.objecao,
            proximoPasso: resumo.proximoPasso,
            ultimaMensagemId: resumo.ultimaMensagemId,
            atualizadoEm: resumo.atualizadoEm.toISOString(),
          }
        : null,
      consentimento: contact.consentimento
        ? {
            status: contact.consentimento.status,
            mensagemOrigemId: contact.consentimento.mensagemOrigemId,
            em: contact.consentimento.em.toISOString(),
          }
        : null,
      tarefasAbertas: tarefas.map((t) => ({
        id: t.id,
        tipo: t.tipo,
        titulo: t.titulo,
        status: t.status,
        responsavel: t.responsavel,
        prazoEm: t.prazoEm?.toISOString() ?? null,
        vencida: vencida(t.prazoEm),
        opportunityId: t.opportunityId,
      })),
    };
  }

  async mensagens(
    id: string,
    query: Record<string, string | undefined>,
  ): Promise<ListaMensagensDTO> {
    await this.conversa(id);
    const take = limite(query.limite, 50, 100);
    let before: Prisma.MessageWhereInput = {};
    if (query.antes) {
      const previous = await this.prisma.message.findFirst({
        where: { id: query.antes, conversationId: id },
        select: { criadaEm: true, id: true },
      });
      if (previous)
        before = {
          OR: [
            { criadaEm: { lt: previous.criadaEm } },
            { criadaEm: previous.criadaEm, id: { lt: previous.id } },
          ],
        };
      else {
        const date = new Date(query.antes);
        if (Number.isNaN(date.getTime()))
          throw new BadRequestException('Cursor de mensagem inválido');
        before = { criadaEm: { lt: date } };
      }
    }
    const rows = await this.prisma.message.findMany({
      where: { conversationId: id, ...before },
      include: { autorUsuario: { select: { id: true, nome: true } } },
      orderBy: [{ criadaEm: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    return {
      itens: rows.slice(0, take).reverse().map(paraMensagemDTO),
      temMais: rows.length > take,
    };
  }

  async trilha(id: string): Promise<TrilhaItemDTO[]> {
    const conv = await this.conversa(id);
    const [acoes, etapas, controle] = await Promise.all([
      this.prisma.agentAction.findMany({
        where: { conversationId: id },
        orderBy: { criadoEm: 'desc' },
        take: 100,
      }),
      this.prisma.opportunityEvent.findMany({
        where: { opportunity: { contactId: conv.contactId } },
        orderBy: { criadoEm: 'desc' },
        take: 100,
      }),
      this.prisma.message.findMany({
        where: { conversationId: id, tipo: 'evento' },
        orderBy: { criadaEm: 'desc' },
        take: 100,
      }),
    ]);
    return [
      ...acoes.map(paraTrilhaAcaoDTO),
      ...etapas.map((e) => paraTrilhaEtapaDTO(e, id)),
      ...controle.map(paraTrilhaControleDTO),
    ].sort((a, b) => a.em.localeCompare(b.em));
  }

  async enviar(id: string, actorId: string, body: unknown): Promise<MensagemDTO> {
    const dto = validar(envioSchema, body);
    const conv = await this.prisma.conversation.findUnique({
      where: { id },
      include: { contact: { include: { consentimento: true } }, numero: true },
    });
    if (!conv) throw new NotFoundException('Conversa não encontrada');
    if (conv.contact.consentimento?.status === 'revogado' && !dto.confirmarRestrito)
      throw new ConflictException('Contato restrito. Confirme o envio manual para continuar.');
    if (conv.estado === 'IA_ATIVA' && !dto.assumir)
      throw new ConflictException('Confirme assumir o atendimento antes de enviar.');
    const demo = [true, 'true', '1'].includes(this.config.get('DEMO_MODE') ?? false);
    const permitido = (await this.settings.numerosPermitidos()).some((n) =>
      mesmoNumero(n, conv.contact.e164),
    );
    if (demo && !ehNumeroFicticio(conv.contact.e164) && !permitido)
      throw new ConflictException(
        'Modo demonstração: adicione este telefone aos números de teste permitidos em Conexões antes de enviar pelo WhatsApp.',
      );
    if (!(demo && !permitido) && (conv.numero.ficticio || conv.numero.estado !== 'conectado'))
      throw new ConflictException('WhatsApp desconectado. Conecte o número antes de enviar.');
    if (dto.assumir) await this.controle.assumir(id, actorId);
    const msg = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${id} FOR UPDATE`;
      const atual = await tx.conversation.findUnique({ where: { id } });
      if (!atual) throw new NotFoundException('Conversa não encontrada');
      if (atual.estado === 'IA_ATIVA')
        throw new ConflictException('A IA foi reativada. Assuma o atendimento para enviar.');
      const criada = await tx.message.create({
        data: {
          conversationId: id,
          numeroId: conv.numeroId,
          autor: 'atendente',
          autorUsuarioId: actorId,
          tipo: 'texto',
          texto: dto.texto,
          status: 'pendente',
          confirmadoRestrito: dto.confirmarRestrito ?? false,
        },
        include: { autorUsuario: { select: { id: true, nome: true } } },
      });
      await tx.conversation.update({ where: { id }, data: { ultimaMensagemEm: criada.criadaEm } });
      return criada;
    });
    await this.publicarMensagem(msg);
    try {
      await this.saida.enfileirar(msg.id, 0);
    } catch {
      await this.prisma.message.update({
        where: { id: msg.id },
        data: { status: 'falhou', motivoFalha: 'Fila de envio indisponível. Tente novamente.' },
      });
      await this.eventos
        .publicar('message.updated', {
          conversationId: id,
          mensagemId: msg.id,
          status: 'falhou',
          motivoFalha: 'Fila de envio indisponível. Tente novamente.',
        })
        .catch(() => undefined);
      throw new ServiceUnavailableException(
        'Mensagem salva, mas a fila está indisponível. Use Tentar de novo.',
      );
    }
    return paraMensagemDTO(msg);
  }

  async nota(id: string, actorId: string, body: unknown): Promise<MensagemDTO> {
    const dto = validar(textoSchema, body);
    const conv = await this.conversa(id);
    const msg = await this.prisma.message.create({
      data: {
        conversationId: id,
        numeroId: conv.numeroId,
        autor: 'atendente',
        tipo: 'nota_interna',
        texto: dto.texto,
        autorUsuarioId: actorId,
      },
      include: { autorUsuario: { select: { id: true, nome: true } } },
    });
    await this.publicarMensagem(msg);
    return paraMensagemDTO(msg);
  }

  async ler(id: string): Promise<void> {
    await this.conversa(id);
    const conv = await this.prisma.conversation.update({
      where: { id },
      data: { naoLidas: 0 },
      include: INCLUDE_CONVERSA_ITEM,
    });
    await this.eventos
      .publicar('conversation.updated', { conversa: paraConversaItemDTO(conv) })
      .catch(() => undefined);
  }

  private async publicarMensagem(msg: Parameters<typeof paraMensagemDTO>[0]) {
    await this.eventos
      .publicar('message.created', {
        conversationId: msg.conversationId,
        mensagem: paraMensagemDTO(msg),
      })
      .catch(() => undefined);
    const conv = await this.conversa(msg.conversationId);
    await this.eventos
      .publicar('conversation.updated', { conversa: paraConversaItemDTO(conv) })
      .catch(() => undefined);
  }

  private async numeroReal(id: string) {
    const numero = await this.prisma.whatsAppNumber.findUnique({ where: { id } });
    if (!numero) throw new NotFoundException('Número não encontrado');
    if (numero.ficticio)
      throw new BadRequestException('Número fictício não pode ser conectado ao WhatsApp');
    return numero;
  }
  async qr(id: string) {
    const numero = await this.numeroReal(id);
    try {
      const { estado } = await this.channel.estadoConexao(numero.instanciaEvolution);
      if (estado === 'erro') throw new Error('Canal indisponível');
      return await this.channel.obterQr(numero.instanciaEvolution);
    } catch {
      throw new ServiceUnavailableException(
        'Evolution indisponível. Confira a conexão e tente novamente.',
      );
    }
  }
  async acaoNumero(id: string, acao: 'reiniciar' | 'desconectar') {
    const numero = await this.numeroReal(id);
    try {
      await this.channel[acao](numero.instanciaEvolution);
    } catch {
      throw new ServiceUnavailableException('Não foi possível atualizar a conexão do WhatsApp.');
    }
    await this.numeros.atualizarEstado(id, acao === 'reiniciar' ? 'reconectando' : 'desconectado');
  }
  async definirPermitidos(body: unknown, actorId: string) {
    const dto = validar(z.object({ numeros: z.array(z.string()).max(100) }), body);
    const numeros = dto.numeros.map((n) => {
      const normalizado = normalizarTelefoneBr(n);
      if (!normalizado)
        throw new BadRequestException('Informe telefones brasileiros válidos com DDD');
      return normalizado;
    });
    const unicos = [...new Set(numeros)];
    await this.settings.definir('demoNumerosPermitidos', unicos, actorId);
    return { numeros: unicos };
  }

  async novaConversa(body: unknown, actorId: string) {
    const dto = validar(
      z.object({
        e164: z.string(),
        nome: z.string().trim().min(1).max(160).optional(),
        numeroId: z.string().optional(),
      }),
      body,
    );
    const e164 = normalizarTelefoneBr(dto.e164);
    if (!e164) throw new BadRequestException('Informe um telefone brasileiro válido com DDD');
    const numero = dto.numeroId
      ? await this.numeroReal(dto.numeroId)
      : await this.prisma.whatsAppNumber.findFirst({
          where: { ficticio: false },
          orderBy: [{ estado: 'asc' }, { rotulo: 'asc' }],
        });
    if (!numero)
      throw new ConflictException(
        'Nenhum número WhatsApp configurado. Configure a conexão primeiro.',
      );
    const contact = await this.prisma.contact.upsert({
      where: { e164 },
      create: { e164, nome: dto.nome },
      update: {},
    });
    const conv = await this.prisma.conversation.upsert({
      where: { contactId_numeroId: { contactId: contact.id, numeroId: numero.id } },
      create: {
        contactId: contact.id,
        numeroId: numero.id,
        estado: 'HUMANO',
        responsavelId: actorId,
        ultimaMensagemEm: new Date(),
      },
      update: {},
    });
    const item = await this.conversa(conv.id);
    await this.eventos
      .publicar('conversation.updated', { conversa: paraConversaItemDTO(item) })
      .catch(() => undefined);
    return { conversationId: conv.id };
  }

  async simular(body: unknown) {
    const dto = validar(
      textoSchema
        .extend({
          contactId: z.string().optional(),
          novoContato: z.object({ nome: z.string().trim().min(1).max(160) }).optional(),
        })
        .refine(
          (v) => Boolean(v.contactId) !== Boolean(v.novoContato),
          'Informe um contato ou novoContato',
        ),
      body,
    );
    const numero = await this.prisma.whatsAppNumber.findFirst({ where: { ficticio: true } });
    if (!numero)
      throw new ConflictException(
        'Base de demonstração ausente. Prepare os dados fictícios antes de simular.',
      );
    const contact = dto.contactId
      ? await this.prisma.contact.findUnique({ where: { id: dto.contactId } })
      : await this.prisma.contact.create({
          data: {
            nome: dto.novoContato!.nome,
            e164: `+55009${String(randomInt(0, 100_000_000)).padStart(8, '0')}`,
            origemDemo: 'ao_vivo',
          },
        });
    if (!contact) throw new NotFoundException('Contato não encontrado');
    if (!ehNumeroFicticio(contact.e164))
      throw new BadRequestException('O simulador aceita apenas contatos fictícios');
    const conv = await this.prisma.conversation.upsert({
      where: { contactId_numeroId: { contactId: contact.id, numeroId: numero.id } },
      create: { contactId: contact.id, numeroId: numero.id, origemDemo: 'ao_vivo' },
      update: {},
    });
    const idExterno = `sim.${randomUUID()}`;
    const evento = {
      tipo: 'mensagem' as const,
      instancia: numero.instanciaEvolution,
      de: contact.e164,
      idExterno,
      fromMe: false,
      tipoMensagem: 'texto' as const,
      texto: dto.texto,
      pushName: contact.nome ?? undefined,
      timestamp: new Date().toISOString(),
    };
    const created = await this.prisma.inboundEvent.create({
      data: {
        idMensagem: idExterno,
        numeroId: numero.id,
        resumo: evento as unknown as Prisma.InputJsonValue,
      },
    });
    await this.inbound.add(
      'inbound-msg',
      { inboundEventId: created.id, numeroId: numero.id, evento },
      { jobId: idExterno },
    );
    return { conversationId: conv.id };
  }

  async oportunidades(
    query: Record<string, string | undefined>,
  ): Promise<OportunidadesPorEtapaDTO> {
    const where: Prisma.OpportunityWhereInput = {};
    if (query.responsavelId) where.responsavelId = query.responsavelId;
    if (query.produto)
      where.produto = validar(z.string().regex(/^[a-z0-9-]{1,60}$/, 'slug do produto inválido'), query.produto);
    if (query.vencidas === 'true') where.proximaAcaoEm = { lt: new Date() };
    if (query.semResposta === 'true')
      where.contact = { conversas: { some: { naoLidas: { gt: 0 } } } };
    const rows = await this.prisma.opportunity.findMany({
      where,
      include: {
        ...INCLUDE_OPORTUNIDADE_CARD,
        contact: {
          select: {
            id: true,
            nome: true,
            e164: true,
            conversas: {
              orderBy: { ultimaMensagemEm: 'desc' },
              take: 1,
              select: { id: true, estado: true },
            },
          },
        },
      },
      orderBy: [{ prioridade: 'desc' }, { etapaDesde: 'asc' }],
    });
    const groups = Object.fromEntries(
      ETAPAS.map((etapa) => [etapa, []]),
    ) as unknown as OportunidadesPorEtapaDTO;
    for (const row of rows) groups[row.etapa].push(paraOportunidadeCardDTO(row));
    return groups;
  }

  async visaoGeral(periodo?: string): Promise<VisaoGeralDTO> {
    const periodoDias = Number(validar(z.enum(['7', '30', '90']), periodo ?? '30')) as 7 | 30 | 90;
    const desde = new Date(Date.now() - periodoDias * 86400000);
    const [ops, conversas, tarefas, novosLeads] = await Promise.all([
      this.prisma.opportunity.findMany({
        include: {
          contact: { select: { nome: true, conversas: { take: 1, select: { id: true } } } },
          eventos: { select: { ator: true } },
        },
      }),
      this.prisma.conversation.findMany({
        include: {
          contact: { select: { nome: true } },
          mensagens: { where: { criadaEm: { gte: desde } }, select: { autor: true, tipo: true } },
        },
      }),
      this.prisma.task.findMany({
        where: { status: 'aberta', prazoEm: { lt: new Date() } },
        include: { conversation: { select: { contact: { select: { nome: true } } } } },
      }),
      this.prisma.contact.count({ where: { createdAt: { gte: desde } } }),
    ]);
    const cohort = ops.filter((o) => o.criadaEm >= desde);
    const ativas = conversas.filter((c) => c.estado !== 'ENCERRADA');
    const dto: VisaoGeralDTO = {
      periodoDias,
      prioridades: [],
      funil: ETAPAS.map((etapa) => ({
        etapa,
        contagem: ops.filter((o) => o.etapa === etapa).length,
        conversaoProxima: null,
      })),
      indicadores: [
        {
          chave: 'novos_leads',
          nome: 'Novos contatos',
          valor: novosLeads,
          formato: 'numero',
          variacao: null,
          periodo: `Últimos ${periodoDias} dias`,
          definicao: 'Contatos cadastrados no período selecionado.',
          origem: 'Contatos • data de criação',
        },
        {
          chave: 'conversas_abertas',
          nome: 'Conversas abertas',
          valor: ativas.length,
          formato: 'numero',
          variacao: null,
          periodo: 'Agora',
          definicao: 'Conversas que ainda não foram encerradas.',
          origem: 'Conversas • estado atual',
        },
        {
          chave: 'vendas',
          nome: 'Vendas confirmadas',
          valor: cohort.filter((o) => o.etapa === 'venda_confirmada').length,
          formato: 'numero',
          variacao: null,
          periodo: `Coorte dos últimos ${periodoDias} dias`,
          definicao: 'Oportunidades criadas no período que estão em venda confirmada.',
          origem: 'Oportunidades • etapa atual e data de criação',
        },
        {
          chave: 'conversao',
          nome: 'Conversão de leads',
          valor: cohort.length
            ? cohort.filter((o) => o.etapa === 'venda_confirmada').length / cohort.length
            : null,
          formato: 'percentual',
          variacao: null,
          periodo: `Coorte dos últimos ${periodoDias} dias`,
          definicao: 'Vendas confirmadas sobre oportunidades criadas no período.',
          origem: 'Oportunidades • coorte por criação',
        },
      ],
      atribuicao: { ia: 0, humano: 0, misto: 0 },
      temDadosDemo:
        ops.some((o) => o.origemDemo != null) || conversas.some((c) => c.origemDemo != null),
    };
    for (const conv of ativas) {
      const age = Date.now() - (conv.ultimaMensagemEm?.getTime() ?? Date.now());
      const base = {
        conversationId: conv.id,
        opportunityId: null,
        taskId: null,
        contatoNome: conv.contact.nome,
        desde: (conv.ultimaMensagemEm ?? conv.createdAt).toISOString(),
      };
      if (conv.prioridade === 'emergencia')
        dto.prioridades.push({
          ...base,
          tipo: 'emergencia_aberta',
          descricao: 'Emergência aguardando acompanhamento humano',
        });
      else if (conv.estado === 'AGUARDANDO_ESPECIALISTA' && age > 15 * 60000)
        dto.prioridades.push({
          ...base,
          tipo: 'transferencia_sem_resposta',
          descricao: 'Transferência sem resposta há mais de 15 minutos',
        });
    }
    for (const op of ops) {
      if (
        op.etapa === 'contratacao_em_andamento' &&
        op.proximaAcaoEm &&
        op.proximaAcaoEm < new Date()
      )
        dto.prioridades.push({
          tipo: 'intencao_sem_retorno',
          conversationId: op.contact.conversas[0]?.id ?? null,
          opportunityId: op.id,
          taskId: null,
          contatoNome: op.contact.nome,
          descricao: 'Intenção de contratar com retorno pendente',
          desde: op.proximaAcaoEm.toISOString(),
        });
    }
    for (const task of tarefas)
      dto.prioridades.push({
        tipo: 'tarefa_vencida',
        conversationId: task.conversationId,
        opportunityId: task.opportunityId,
        taskId: task.id,
        contatoNome: task.conversation?.contact.nome ?? null,
        descricao: task.titulo,
        desde: task.prazoEm!.toISOString(),
      });
    for (const venda of cohort.filter((o) => o.etapa === 'venda_confirmada')) {
      const autores = new Set(
        conversas
          .filter((c) => c.contactId === venda.contactId)
          .flatMap((c) => c.mensagens)
          .filter((m) => m.tipo === 'texto')
          .map((m) => m.autor),
      );
      if (autores.has('ia') && autores.has('atendente')) dto.atribuicao.misto++;
      else if (autores.has('ia')) dto.atribuicao.ia++;
      else if (autores.has('atendente')) dto.atribuicao.humano++;
    }
    return dto;
  }
}
