import type { EventoTempoReal } from '@sales-hub/shared';
import { INCLUDE_OPORTUNIDADE_CARD, paraOportunidadeCardDTO } from '../../../common/mapeadores';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { EventosService } from '../../realtime/eventos.service';

/** Contexto do turno injetado pelo servidor (nunca vem do modelo). */
export interface ContextoTurno {
  conversationId: string;
  contactId: string;
  mensagemOrigemId: string;
  agentTurnId: string;
  /** `versaoControle` lida no início do turno. */
  versao: number;
  /** Bolhas criadas neste turno. */
  bolhasIds: string[];
  /** Bolhas bloqueadas pelo filtro de saída neste turno. */
  bloqueios: number;
  /** Último item de interesse criado ou completado neste turno. */
  itemRecenteId?: string;
}

export interface ResultadoFerramenta {
  ok: boolean;
  resultado?: unknown;
  erro?: string;
  /** Encerra o turno (emergência, interrupção, transferência). */
  terminal?: boolean;
  /** Bloqueio do filtro de saída (conta para os 2 bloqueios do turno). */
  bloqueio?: boolean;
  /** A garantia de parada barrou a escrita (versão/estado mudaram). */
  abortado?: boolean;
}

/** Garantia de parada (spec §8.3 item 4): estado ou versão mudaram desde o início do turno? */
export async function controleMudou(prisma: PrismaService, ctx: Pick<ContextoTurno, 'conversationId' | 'versao'>): Promise<boolean> {
  const c = await prisma.conversation.findUnique({
    where: { id: ctx.conversationId },
    select: { estado: true, versaoControle: true },
  });
  return !c || c.estado !== 'IA_ATIVA' || c.versaoControle !== ctx.versao;
}

export function oportunidadeAberta(prisma: PrismaService, contactId: string) {
  return prisma.opportunity.findFirst({
    where: { contactId, fechadaEm: null },
    orderBy: { criadaEm: 'desc' },
  });
}

export function primeiroAtendente(prisma: PrismaService) {
  return prisma.user
    .findFirst({ where: { papel: 'atendente', ativo: true }, orderBy: { createdAt: 'asc' } })
    .then((u) => u ?? prisma.user.findFirst({ where: { ativo: true }, orderBy: { createdAt: 'asc' } }));
}

/** Eventos são best-effort: nunca derrubam o que já foi gravado. */
export async function publicar<T extends EventoTempoReal['tipo']>(
  eventos: EventosService,
  tipo: T,
  payload: Extract<EventoTempoReal, { tipo: T }>['payload'],
): Promise<void> {
  try {
    await (eventos.publicar as (t: string, p: unknown) => Promise<void>)(tipo, payload);
  } catch {
    /* ignorado */
  }
}

export async function publicarOportunidade(prisma: PrismaService, eventos: EventosService, id: string): Promise<void> {
  const op = await prisma.opportunity.findUnique({ where: { id }, include: INCLUDE_OPORTUNIDADE_CARD });
  if (op) await publicar(eventos, 'opportunity.updated', { oportunidade: paraOportunidadeCardDTO(op) });
}

export const marcaIa = (ctx: ContextoTurno, campos: string[], atual: unknown, extra: Record<string, unknown> = {}) => {
  const base = atual && typeof atual === 'object' ? { ...(atual as Record<string, unknown>) } : {};
  const em = new Date().toISOString();
  for (const c of campos) base[c] = { mensagemId: ctx.mensagemOrigemId, em, ...((extra[c] as object) ?? {}) };
  return base;
};
