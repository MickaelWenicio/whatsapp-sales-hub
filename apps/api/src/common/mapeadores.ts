import type { AgentAction, Message, OpportunityEvent, Prisma, WhatsAppNumber } from '@prisma/client';
import {
  formatarTelefoneExibicao,
  ROTULOS_ETAPA,
  type ConversaItemDTO,
  type MensagemDTO,
  type NumeroDTO,
  type OportunidadeCardDTO,
  type TrilhaItemDTO,
} from '@sales-hub/shared';

/** Mapeadores Prisma para os DTOs do contrato com o painel. Datas saem em ISO 8601. */

export function paraNumeroDTO(numero: WhatsAppNumber): NumeroDTO {
  return {
    id: numero.id,
    rotulo: numero.rotulo,
    e164: numero.e164,
    telefoneExibicao: formatarTelefoneExibicao(numero.e164),
    instancia: numero.instanciaEvolution,
    // desconectado com falha registrada = a última verificação de saúde não alcançou a Evolution
    estado: numero.estado === 'desconectado' && numero.ultimaFalha ? 'erro' : numero.estado,
    ultimoEstadoEm: numero.ultimoEstadoEm?.toISOString() ?? null,
    ultimaFalha: numero.ultimaFalha,
    ficticio: numero.ficticio,
  };
}

export function paraMensagemDTO(
  msg: Message & { autorUsuario?: { id: string; nome: string } | null },
): MensagemDTO {
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    autor: msg.autor,
    tipo: msg.tipo,
    texto: msg.texto,
    status: msg.status,
    motivoFalha: msg.motivoFalha,
    autorUsuario: msg.autorUsuario ? { id: msg.autorUsuario.id, nome: msg.autorUsuario.nome } : null,
    criadaEm: msg.criadaEm.toISOString(),
    citadaId: msg.citadaId,
  };
}

/** Relações que `paraConversaItemDTO` precisa; use em `findMany/findUnique({ include })`. */
export const INCLUDE_CONVERSA_ITEM = {
  contact: {
    select: {
      id: true,
      nome: true,
      e164: true,
      // etapa da oportunidade aberta (a mais recente)
      oportunidades: {
        where: { fechadaEm: null },
        orderBy: { criadaEm: 'desc' },
        take: 1,
        select: { etapa: true },
      },
    },
  },
  responsavel: { select: { id: true, nome: true } },
  setor: { select: { id: true, nome: true } },
  mensagens: {
    orderBy: { criadaEm: 'desc' },
    take: 1,
    select: { autor: true, tipo: true, texto: true, criadaEm: true },
  },
} satisfies Prisma.ConversationInclude;

export type ConversaParaItem = Prisma.ConversationGetPayload<{ include: typeof INCLUDE_CONVERSA_ITEM }>;

export function paraConversaItemDTO(conv: ConversaParaItem): ConversaItemDTO {
  const ultima = conv.mensagens[0] ?? null;
  const etapa = conv.contact.oportunidades[0]?.etapa ?? null;
  return {
    id: conv.id,
    contato: {
      id: conv.contact.id,
      nome: conv.contact.nome,
      e164: conv.contact.e164,
      telefoneExibicao: formatarTelefoneExibicao(conv.contact.e164),
    },
    estado: conv.estado,
    prioridade: conv.prioridade,
    responsavel: conv.responsavel ? { id: conv.responsavel.id, nome: conv.responsavel.nome } : null,
    setor: conv.setor ? { id: conv.setor.id, nome: conv.setor.nome } : null,
    naoLidas: conv.naoLidas,
    ultimaMensagem: ultima
      ? { autor: ultima.autor, tipo: ultima.tipo, texto: ultima.texto, criadaEm: ultima.criadaEm.toISOString() }
      : null,
    ultimaMensagemEm: conv.ultimaMensagemEm?.toISOString() ?? null,
    janelaAteEm: conv.janelaAteEm?.toISOString() ?? null,
    etapa,
    intencao: etapa === 'contratacao_em_andamento',
  };
}

/** Rótulo do número do canal comercial (seed). A conversa do card é a do contato nesse número. */
export const ROTULO_NUMERO_COMERCIAL = 'Comercial';

/** Setor que recebe as conversas de emergência (criado pelo seed). */
export const SETOR_EMERGENCIA = 'Suporte';

/** Relações que `paraOportunidadeCardDTO` precisa. */
export const INCLUDE_OPORTUNIDADE_CARD = {
  contact: {
    select: {
      id: true,
      nome: true,
      e164: true,
      conversas: {
        where: { numero: { rotulo: ROTULO_NUMERO_COMERCIAL } },
        take: 1,
        select: { id: true, estado: true },
      },
    },
  },
  item: { select: { categoria: true, descricao: true } },
  responsavel: { select: { id: true, nome: true } },
  // último movimento feito pela IA (ícone das últimas 24 h)
  eventos: {
    where: { ator: 'ia' },
    orderBy: { criadoEm: 'desc' },
    take: 1,
    select: { criadoEm: true },
  },
} satisfies Prisma.OpportunityInclude;

export type OportunidadeParaCard = Prisma.OpportunityGetPayload<{ include: typeof INCLUDE_OPORTUNIDADE_CARD }>;

export function paraOportunidadeCardDTO(op: OportunidadeParaCard, agora: Date = new Date()): OportunidadeCardDTO {
  const conversa = op.contact.conversas[0] ?? null;
  return {
    id: op.id,
    conversationId: conversa?.id ?? null,
    contato: { id: op.contact.id, nome: op.contact.nome, e164: op.contact.e164 },
    item: op.item ? { categoria: op.item.categoria, descricao: op.item.descricao } : null,
    produto: op.produto,
    etapa: op.etapa,
    etapaDesde: op.etapaDesde.toISOString(),
    proximaAcao: op.proximaAcao,
    proximaAcaoEm: op.proximaAcaoEm?.toISOString() ?? null,
    vencida: op.proximaAcaoEm != null && op.proximaAcaoEm.getTime() < agora.getTime(),
    responsavel: op.responsavel ? { id: op.responsavel.id, nome: op.responsavel.nome } : null,
    estadoConversa: conversa?.estado ?? null,
    movidaPelaIaEm: op.eventos[0]?.criadoEm.toISOString() ?? null,
    prioridade: op.prioridade,
  };
}

const TITULO_FERRAMENTA: Record<string, string> = {
  responder: 'Respondeu ao cliente',
  atualizar_contato: 'Atualizou o contato',
  registrar_item: 'Registrou o item de interesse',
  registrar_interesse: 'Registrou o interesse',
  mover_etapa: 'Moveu a etapa da oportunidade',
  registrar_objecao: 'Registrou uma objeção',
  solicitar_cotacao: 'Solicitou cotação',
  sinalizar_intencao: 'Sinalizou intenção de contratar',
  transferir_para_humano: 'Transferiu para uma pessoa',
  sinalizar_emergencia: 'Sinalizou emergência',
  registrar_interrupcao: 'Registrou pedido para parar as mensagens',
};

/** Ação da IA (AgentAction) -> item da trilha. */
export function paraTrilhaAcaoDTO(acao: AgentAction): TrilhaItemDTO {
  return {
    id: acao.id,
    conversationId: acao.conversationId,
    tipo: 'acao_ia',
    titulo: TITULO_FERRAMENTA[acao.ferramenta] ?? `Executou ${acao.ferramenta}`,
    ferramenta: acao.ferramenta,
    ...(acao.justificativa ? { justificativa: acao.justificativa } : {}),
    ...(acao.mensagemOrigemId ? { mensagemOrigemId: acao.mensagemOrigemId } : {}),
    status: acao.status,
    em: acao.criadoEm.toISOString(),
  };
}

/** Movimento de etapa (OpportunityEvent) -> item da trilha. A conversa vem de fora (o evento não a guarda). */
export function paraTrilhaEtapaDTO(ev: OpportunityEvent, conversationId: string): TrilhaItemDTO {
  return {
    id: ev.id,
    conversationId,
    tipo: 'etapa',
    titulo: `Moveu para ${ROTULOS_ETAPA[ev.para]}`,
    ...(ev.justificativa ? { justificativa: ev.justificativa } : {}),
    ...(ev.mensagemOrigemId ? { mensagemOrigemId: ev.mensagemOrigemId } : {}),
    em: ev.criadoEm.toISOString(),
  };
}

/** Mensagem de evento de controle (tipo 'evento', ex.: "Ana assumiu o atendimento") -> item da trilha. */
export function paraTrilhaControleDTO(msg: Message): TrilhaItemDTO {
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    tipo: 'controle',
    titulo: msg.texto ?? 'Evento de atendimento',
    em: msg.criadaEm.toISOString(),
  };
}

export function paraTrilhaItemDTO(item: AgentAction): TrilhaItemDTO;
export function paraTrilhaItemDTO(item: OpportunityEvent, conversationId: string): TrilhaItemDTO;
export function paraTrilhaItemDTO(item: Message): TrilhaItemDTO;
export function paraTrilhaItemDTO(item: AgentAction | OpportunityEvent | Message, conversationId?: string): TrilhaItemDTO {
  if ('ferramenta' in item) return paraTrilhaAcaoDTO(item);
  if ('para' in item) return paraTrilhaEtapaDTO(item, conversationId ?? '');
  return paraTrilhaControleDTO(item);
}
