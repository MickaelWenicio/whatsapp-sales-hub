/**
 * Apoio dos testes do agente (sem vitest aqui, para poder compilar junto). LLM falso com
 * respostas `BetaMessage` roteirizadas, dublês de eventos/filas e a montagem do agente com os
 * serviços reais (Prisma, Outbound, Controle, Funil).
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { PrismaService } from '../../../prisma/prisma.service';
import { ControleService } from '../../controle/controle.service';
import { FunilService } from '../../crm/funil.service';
import { OutboundService } from '../../outbound/outbound.service';
import type { EventosService } from '../../realtime/eventos.service';
import type { AuditService } from '../../security/audit.service';
import type { SettingsService } from '../../security/settings.service';
import type { AgenteLLM, EntradaLLM } from '../llm.types';
import { Orquestrador } from '../orchestrator';
import { ResumoService } from '../resumo.service';
import { CrmTools } from '../tools/crm.tools';
import { Dispatcher } from '../tools/dispatcher';
import { FunilTools } from '../tools/funil.tools';
import { ResponderTool } from '../tools/responder.tool';
import { SegurancaTools } from '../tools/seguranca.tools';

type BetaMessage = Anthropic.Beta.BetaMessage;
type Roteiro = BetaMessage | Error | ((input: EntradaLLM) => Promise<BetaMessage>);

let seqId = 0;

export function usoTokens(input = 10, output = 5, extra: Record<string, unknown> = {}) {
  return { input_tokens: input, output_tokens: output, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...extra };
}

/** Uma resposta do modelo. */
export function resposta(
  content: unknown[],
  stop_reason: string = content.some((b) => (b as { type?: string }).type === 'tool_use') ? 'tool_use' : 'end_turn',
  usage: Record<string, unknown> = usoTokens(),
): BetaMessage {
  return {
    id: `msg_falsa_${++seqId}`,
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content,
    stop_reason,
    stop_sequence: null,
    usage,
  } as unknown as BetaMessage;
}

export function ferramenta(name: string, input: Record<string, unknown>, id = `toolu_${++seqId}`) {
  return { type: 'tool_use', id, name, input };
}

export function texto(text: string) {
  return { type: 'text', text, citations: null };
}

export const fim = () => resposta([], 'end_turn');

/** LLM falso: devolve o roteiro em ordem (o último se repete). Guarda uma cópia de cada entrada. */
export class LlmFalso implements AgenteLLM {
  entradas: EntradaLLM[] = [];
  constructor(private readonly roteiro: Roteiro[]) {}
  get chamadas(): number {
    return this.entradas.length;
  }
  async responder(input: EntradaLLM): Promise<BetaMessage> {
    const passo = this.roteiro[this.entradas.length] ?? this.roteiro[this.roteiro.length - 1]!;
    this.entradas.push(structuredClone(input));
    if (passo instanceof Error) throw passo;
    if (typeof passo === 'function') return passo(input);
    return passo;
  }
}

export interface Publicado {
  tipo: string;
  payload: Record<string, unknown>;
  em: number;
}

export function eventosFalsos(): { eventos: EventosService; publicados: Publicado[] } {
  const publicados: Publicado[] = [];
  const eventos = {
    publicar: async (tipo: string, payload: Record<string, unknown>) => {
      publicados.push({ tipo, payload: structuredClone(payload), em: Date.now() });
    },
  } as unknown as EventosService;
  return { eventos, publicados };
}

export interface JobAdicionado {
  name: string;
  data: Record<string, unknown>;
  opts: Record<string, unknown>;
}

/** Fila falsa: registra `add` e `remove`, sem Redis. */
export function filaFalsa(): { fila: Queue; adds: JobAdicionado[]; removidos: string[] } {
  const adds: JobAdicionado[] = [];
  const removidos: string[] = [];
  const fila = {
    add: async (name: string, data: Record<string, unknown>, opts: Record<string, unknown> = {}) => {
      adds.push({ name, data, opts });
      return { id: opts.jobId };
    },
    remove: async (id: string) => {
      removidos.push(id);
      return 1;
    },
    getJob: async () => undefined,
  } as unknown as Queue;
  return { fila, adds, removidos };
}

export const configFalsa = (extra: Record<string, unknown> = {}) =>
  ({
    get: (k: string) =>
      ({ AGENT_MODEL: 'claude-opus-5-5', AGENT_EFFORT: 'low', AGENT_HISTORICO_MAX: 40, DEMO_MODE: false, ...extra })[k],
  }) as unknown as ConfigService;

export interface AmbienteAgente {
  orquestrador: Orquestrador;
  saida: OutboundService;
  controle: ControleService;
  funil: FunilService;
  resumo: ResumoService;
  dispatcher: Dispatcher;
  seguranca: SegurancaTools;
  publicados: Publicado[];
  filaResumo: ReturnType<typeof filaFalsa>;
  filaSaida: ReturnType<typeof filaFalsa> | null;
}

/** Monta o agente com serviços reais e dublês de borda. `filaSaida` real (BullMQ) é opcional. */
export function montarAgente(
  prisma: PrismaService,
  o: {
    llm: AgenteLLM;
    filaSaida?: Queue;
    eventos?: EventosService;
    publicados?: Publicado[];
    iaGlobal?: () => boolean;
    esperaSaidaMs?: number;
  },
): AmbienteAgente {
  const base = o.eventos ? { eventos: o.eventos, publicados: o.publicados ?? [] } : eventosFalsos();
  const { eventos, publicados } = base;
  const filaSaidaFalsa = o.filaSaida ? null : filaFalsa();
  const saida = new OutboundService(o.filaSaida ?? filaSaidaFalsa!.fila, prisma, eventos);
  const audit = { registrar: async () => undefined } as unknown as AuditService;
  const controle = new ControleService(prisma, audit, eventos, saida);
  const funil = new FunilService(prisma, eventos);
  const settings = {
    iaGlobalAtiva: async () => (o.iaGlobal ? o.iaGlobal() : true),
    // os contatos de teste (+5500...) são os permitidos
    numerosPermitidos: async () =>
      (await prisma.contact.findMany({ where: { e164: { startsWith: '+5500' } }, select: { e164: true } })).map((c) => c.e164),
  } as unknown as SettingsService;
  const config = configFalsa();
  const filaResumo = filaFalsa();
  const resumo = new ResumoService(prisma, eventos, config, filaResumo.fila);
  const opcoes = { esperaSaidaMs: o.esperaSaidaMs ?? 0 };
  const seguranca = new SegurancaTools(prisma, saida, controle, resumo, eventos, opcoes);
  const dispatcher = new Dispatcher(
    new ResponderTool(prisma, saida, config),
    new CrmTools(prisma, funil, eventos),
    new FunilTools(prisma, funil, eventos),
    seguranca,
  );
  const orquestrador = new Orquestrador(o.llm, prisma, dispatcher, seguranca, saida, settings, eventos, config, resumo);
  return { orquestrador, saida, controle, funil, resumo, dispatcher, seguranca, publicados, filaResumo, filaSaida: filaSaidaFalsa };
}
