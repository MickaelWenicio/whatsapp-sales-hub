import { z } from 'zod';
import type {
  ConversaItemDTO,
  MensagemDTO,
  NumeroDTO,
  OportunidadeCardDTO,
  TrilhaItemDTO,
} from './contrato';
import type { StatusMensagem } from './enums';
import { STATUS_MENSAGEM } from './enums';

// Validação do envelope e das chaves de identificação; o restante do payload passa adiante.
const dto = (chaves: Record<string, z.ZodType>) => z.object(chaves).passthrough();
const id = z.string().min(1);

const envelope = <T extends string, P extends z.ZodType>(tipo: T, payload: P) =>
  z.object({ id, tipo: z.literal(tipo), payload, em: z.string().datetime() });

const schema = z.discriminatedUnion('tipo', [
  envelope('message.created', z.object({ conversationId: id, mensagem: dto({ id }) })),
  envelope(
    'message.updated',
    z.object({
      conversationId: id,
      mensagemId: id,
      status: z.enum(STATUS_MENSAGEM),
      motivoFalha: z.string().nullish(),
    }),
  ),
  envelope('conversation.updated', z.object({ conversa: dto({ id }) })),
  envelope('agent.typing', z.object({ conversationId: id, ativo: z.boolean() })),
  envelope('agent.action', z.object({ conversationId: id, item: dto({ id }) })),
  envelope('summary.updated', z.object({ conversationId: id })),
  envelope('opportunity.updated', z.object({ oportunidade: dto({ id }) })),
  envelope('task.updated', z.object({ taskId: id, opportunityId: z.string().optional() })),
  envelope('number.status', z.object({ numero: dto({ id }) })),
  envelope('settings.updated', z.object({ chave: id })),
]);

interface Envelope<T extends string, P> {
  id: string;
  tipo: T;
  payload: P;
  em: string;
}

export type EventoTempoReal =
  | Envelope<'message.created', { conversationId: string; mensagem: MensagemDTO }>
  | Envelope<
      'message.updated',
      { conversationId: string; mensagemId: string; status: StatusMensagem; motivoFalha?: string | null }
    >
  | Envelope<'conversation.updated', { conversa: ConversaItemDTO }>
  | Envelope<'agent.typing', { conversationId: string; ativo: boolean }>
  | Envelope<'agent.action', { conversationId: string; item: TrilhaItemDTO }>
  | Envelope<'summary.updated', { conversationId: string }>
  | Envelope<'opportunity.updated', { oportunidade: OportunidadeCardDTO }>
  | Envelope<'task.updated', { taskId: string; opportunityId?: string }>
  | Envelope<'number.status', { numero: NumeroDTO }>
  | Envelope<'settings.updated', { chave: string }>;

export type TipoEventoTempoReal = EventoTempoReal['tipo'];

/** Valida a forma do envelope; o tipo de saída é o contrato completo (DTOs confiados). */
export const EventoTempoRealSchema = schema as unknown as z.ZodType<EventoTempoReal>;
