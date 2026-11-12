import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboundProcessor } from '../outbound/outbound.processor';
import { OutboundService } from '../outbound/outbound.service';
import { OrquestradorDemo } from './orquestrador-demo';
import { EventoTempoRealSchema } from '@sales-hub/shared';

describe('Roteiro demo + persistência + saída simulada, sem canal externo', () => {
  const prisma = new PrismaService();
  const run = randomUUID();
  const jobs: any[] = [];
  const events: any[] = [];
  let chamadasCanal = 0;
  const queue: any = { add: async (_nome: string, payload: any) => jobs.push(payload) };
  const eventos: any = {
    publicar: async (tipo: string, payload: any) => {
      const envelope = {
        id: String(events.length + 1),
        tipo,
        payload,
        em: new Date().toISOString(),
      };
      expect(EventoTempoRealSchema.safeParse(envelope).success).toBe(true);
      events.push(envelope);
    },
  };
  const settings: any = { iaGlobalAtiva: async () => true, numerosPermitidos: async () => [] };
  const config: any = { get: (key: string) => (key === 'DEMO_MODE' ? true : undefined) };
  const channel: any = {
    enviarTexto: async () => {
      chamadasCanal++;
      throw new Error('Não pode chamar canal externo neste teste');
    },
    enviarPresenca: async () => {
      chamadasCanal++;
      throw new Error('Não pode chamar canal externo neste teste');
    },
  };
  const saida = new OutboundService(queue, prisma, eventos);
  const processor = new OutboundProcessor(prisma, channel, settings, eventos, config);
  // Isolate only the global switch lookup inside the transaction; never modify live settings.
  const db = new Proxy(prisma, {
    get(target, property) {
      if (property === '$transaction')
        return (fn: any) =>
          target.$transaction((tx) =>
            fn(
              new Proxy(tx, {
                get(inner, key) {
                  if (key === 'systemSetting') return { findUnique: async () => ({ valor: true }) };
                  return Reflect.get(inner, key);
                },
              }),
            ),
          );
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const demo = new OrquestradorDemo(db, settings, saida, eventos, config);
  let numeroId: string;
  let contactId: string;
  let conversationId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const e164 = () => `+5500${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
    numeroId = (
      await prisma.whatsAppNumber.create({
        data: {
          rotulo: `Demo teste ${run}`,
          instanciaEvolution: `demo-test-${run}`,
          e164: e164(),
          ficticio: true,
        },
      })
    ).id;
    contactId = (
      await prisma.contact.create({
        data: { nome: 'Contato fictício do teste', e164: e164(), origemDemo: 'ao_vivo' },
      })
    ).id;
    conversationId = (
      await prisma.conversation.create({ data: { contactId, numeroId, origemDemo: 'ao_vivo' } })
    ).id;
    await prisma.message.create({
      data: {
        conversationId,
        numeroId,
        autor: 'cliente',
        texto: 'Quero saber o preço do plano para minha casa',
      },
    });
  });
  afterAll(async () => {
    processor.onModuleDestroy();
    if (contactId) await prisma.contact.deleteMany({ where: { id: contactId } });
    if (numeroId) await prisma.whatsAppNumber.deleteMany({ where: { id: numeroId } });
    await prisma.$disconnect();
  });
  it('grava turno uso zero, resumo demonstrativo e mensagem que chega a lida sem WhatsApp', async () => {
    expect(await demo.processar(conversationId, { emergencia: false, interrupcao: false })).toBe(
      'respondido',
    );
    expect(jobs).toHaveLength(1);
    const message = await prisma.message.findUniqueOrThrow({ where: { id: jobs[0].messageId } });
    expect(message).toMatchObject({ autor: 'ia', status: 'pendente' });
    expect(message.texto).toContain('69,90');
    expect(await prisma.agentTurn.findFirst({ where: { conversationId } })).toMatchObject({
      modelo: 'demonstracao-local-sem-llm',
      resultado: 'ok',
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    expect(
      await prisma.conversationSummary.findUnique({ where: { conversationId } }),
    ).toMatchObject({ querOQue: 'Demonstração automática: interesse no Plano Essencial' });
    await processor.process({ data: { ...jobs[0], digitandoMs: 0 } } as any);
    expect((await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).status).toBe(
      'enviada',
    );
    const deadline = Date.now() + 6000;
    while (
      (await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).status !== 'lida' &&
      Date.now() < deadline
    )
      await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).status).toBe(
      'lida',
    );
    expect(chamadasCanal).toBe(0);
    expect(events.some((e) => e.tipo === 'summary.updated')).toBe(true);
    expect(events.some((e) => e.tipo === 'agent.action' && e.payload.item.tipo === 'acao_ia')).toBe(
      true,
    );
  });
});
