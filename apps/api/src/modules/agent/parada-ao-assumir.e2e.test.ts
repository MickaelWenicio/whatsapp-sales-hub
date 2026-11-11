import type { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '../../queue/queue.constants';
import { parseRedisUrl } from '../../queue/redis-connection';
import type { ChannelPort } from '../channel/channel.port';
import { OPCOES_WORKER_SAIDA, OutboundProcessor, type JobEnvio } from '../outbound/outbound.processor';
import type { SettingsService } from '../security/settings.service';
import { LlmFalso, eventosFalsos, ferramenta, fim, montarAgente, resposta } from './testing/ambiente';
import { FixturesAgente } from './testing/fixtures';

/**
 * Spec §8.3 item 6 (obrigatório): com a IA no meio de um turno (LLM falso com atraso) e duas
 * bolhas na fila, "Assumir atendimento" resulta em zero mensagens automáticas enviadas depois do
 * clique. Saída real da Task 9 (OutboundService + OutboundProcessor num Worker BullMQ, fila com
 * prefixo próprio) e canal falso que registra o instante de cada chamada.
 */
interface Chamada {
  tipo: 'texto' | 'presenca';
  em: number;
  para: string;
  texto?: string;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function esperarAte(f: () => Promise<boolean>, ms = 20_000): Promise<void> {
  const fim = Date.now() + ms;
  while (!(await f())) {
    if (Date.now() > fim) throw new Error('timeout esperando condição');
    await esperar(50);
  }
}

describe('parada ao assumir (spec §8.3 item 6)', () => {
  const prisma = new PrismaService();
  const fx = new FixturesAgente(prisma);
  const conexao = parseRedisUrl(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const prefix = `t10b-${fx.run}`;
  const chamadas: Chamada[] = [];
  const { eventos, publicados } = eventosFalsos();
  let fila: Queue;
  let worker: Worker;
  let processor: OutboundProcessor;
  let usuarioId = '';

  const canal = {
    enviarTexto: async (_instancia: string, para: string, texto: string) => {
      chamadas.push({ tipo: 'texto', em: Date.now(), para, texto });
      return { idExterno: `T10B${fx.run}${chamadas.length}` };
    },
    enviarPresenca: async (_instancia: string, para: string) => {
      chamadas.push({ tipo: 'presenca', em: Date.now(), para });
    },
  } as unknown as ChannelPort;

  beforeAll(async () => {
    await prisma.$connect();
    await fx.preparar('conectado');
    const u = await prisma.user.create({
      data: { nome: `Dono T10b${fx.run}`, email: `dono.t10b.${fx.run}@teste.local`, papel: 'dono', senhaHash: 'x' },
    });
    usuarioId = u.id;
    const config = { get: (k: string) => (k === 'DEMO_MODE' ? false : undefined) } as unknown as ConfigService;
    const settings = { iaGlobalAtiva: async () => true, numerosPermitidos: async () => [] } as unknown as SettingsService;
    fila = new Queue(QUEUES.OUTBOUND, { connection: conexao, prefix });
    processor = new OutboundProcessor(prisma, canal, settings, eventos, config);
    worker = new Worker(QUEUES.OUTBOUND, async (job: Job<JobEnvio>) => processor.process(job), {
      connection: conexao,
      prefix,
      ...OPCOES_WORKER_SAIDA,
    });
    await worker.waitUntilReady();
  });

  afterAll(async () => {
    await worker?.close();
    processor?.onModuleDestroy();
    await fila?.obliterate({ force: true });
    await fila?.close();
    await fx.limpar();
    await prisma.message.deleteMany({ where: { autorUsuarioId: usuarioId } });
    await prisma.user.deleteMany({ where: { id: usuarioId } });
    await prisma.$disconnect();
  });

  it('assumir durante o turno (LLM falso com atraso) e com duas bolhas na fila → zero mensagens automáticas enviadas depois do clique', async () => {
    const { conversa, contato } = await fx.conversa('Oi, quero saber do Plano Essencial');

    // 1) turno A: duas bolhas pendentes na fila real (digitando de 2 a 5 s cada)
    const llmA = new LlmFalso([
      resposta([
        ferramenta('responder', {
          mensagens: ['Oi! O Plano Essencial sai a partir de R$ 69,90/mês.', 'É para você ou para uma empresa?'],
          justificativa: 'Responde o preço público.',
        }),
      ]),
      fim(),
    ]);
    const a = montarAgente(prisma, { llm: llmA, filaSaida: fila, eventos, publicados });
    expect(await a.orquestrador.processar(conversa.id, { emergencia: false, interrupcao: false })).toBe('ok');
    const bolhasA = await prisma.message.findMany({ where: { conversationId: conversa.id, autor: 'ia' } });
    expect(bolhasA).toHaveLength(2);
    expect(bolhasA.every((m) => m.status === 'pendente')).toBe(true);

    // 2) turno B: o cliente escreve de novo e o LLM demora 1,5 s
    await fx.cliente(conversa.id, 'É para a minha loja');
    const llmB = new LlmFalso([
      async () => {
        await esperar(1500);
        return resposta([ferramenta('responder', { mensagens: ['Legal! Quantas pessoas trabalham na loja?'], justificativa: 'Qualifica.' })]);
      },
      fim(),
    ]);
    const b = montarAgente(prisma, { llm: llmB, filaSaida: fila, eventos, publicados });
    const turnoB = b.orquestrador.processar(conversa.id, { emergencia: false, interrupcao: false });

    // 3) o dono clica em "Assumir atendimento" no meio do turno B
    await esperar(300);
    expect(llmB.chamadas).toBe(1); // B está dentro de llm.responder
    const clique = Date.now();
    await a.controle.assumir(conversa.id, usuarioId);

    // 4) turno B termina abortado; drena a fila de saída
    expect(await turnoB).toBe('abortado');
    await esperarAte(async () => {
      const pend = await prisma.message.count({
        where: { conversationId: conversa.id, autor: 'ia', status: { in: ['pendente', 'enviando'] } },
      });
      const ativos = await fila.getActiveCount();
      const esperando = await fila.getWaitingCount();
      return pend === 0 && ativos === 0 && esperando === 0;
    });
    await esperar(500);

    const textos = chamadas.filter((c) => c.para === contato.e164 && c.tipo === 'texto');
    expect(textos.filter((c) => c.em >= clique)).toHaveLength(0);
    expect(textos).toHaveLength(0);

    const finais = await prisma.message.findMany({ where: { id: { in: bolhasA.map((m) => m.id) } } });
    expect(finais.map((m) => m.status)).toEqual(['cancelada', 'cancelada']);
    expect(await prisma.message.count({ where: { conversationId: conversa.id, autor: 'ia', status: { not: 'cancelada' } } })).toBe(0);

    const turnos = await prisma.agentTurn.findMany({ where: { conversationId: conversa.id }, orderBy: { iniciadoEm: 'asc' } });
    expect(turnos.map((t) => t.resultado)).toEqual(['ok', 'abortado']);
    const acoesB = await prisma.agentAction.findMany({ where: { agentTurnId: turnos[1]!.id } });
    expect(acoesB).toHaveLength(1);
    expect(acoesB[0]).toMatchObject({
      ferramenta: 'responder',
      status: 'descartada',
      justificativa: 'Resposta descartada: atendimento assumido',
    });
  }, 40_000);
});
