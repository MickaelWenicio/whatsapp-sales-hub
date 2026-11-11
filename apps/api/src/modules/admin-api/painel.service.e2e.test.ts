import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { ControleService } from '../controle/controle.service';
import { PainelService } from './painel.service';

// Only this run's ids are created/deleted. Queue, audit and channel are isolated fakes.
describe('PainelService (Postgres, sem envio real)', () => {
  const prisma = new PrismaService();
  const run = randomUUID();
  const queued: string[] = [];
  const emitted: any[] = [];
  const audit: any = { registrar: async () => undefined };
  const eventos: any = {
    publicar: async (tipo: string, payload: unknown) => emitted.push({ tipo, payload }),
  };
  const saida: any = {
    enfileirar: async (id: string) => queued.push(id),
    cancelarAutomaticasPendentes: async () => 0,
  };
  const controle = new ControleService(prisma, audit, eventos, saida);
  const settings: any = { numerosPermitidos: async () => [] };
  const config: any = { get: () => true };
  const channel: any = {
    enviarTexto: async () => {
      throw new Error('TESTE NUNCA DEVE ENVIAR WHATSAPP');
    },
  };
  const service = new PainelService(
    prisma,
    controle,
    saida,
    eventos,
    settings,
    {} as any,
    channel,
    config,
    {} as any,
  );
  let userId: string;
  let numeroId: string;
  let contactId: string;
  let conversationId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: {
        nome: 'Teste painel',
        email: `painel-${run}@example.invalid`,
        papel: 'dono',
        senhaHash: 'test-only',
      },
    });
    userId = user.id;
    const numero = await prisma.whatsAppNumber.create({
      data: {
        rotulo: `Teste painel ${run}`,
        instanciaEvolution: `painel-${run}`,
        e164: `+5500${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
        ficticio: true,
      },
    });
    numeroId = numero.id;
    const contact = await prisma.contact.create({
      data: {
        nome: `Contato ${run}`,
        e164: `+5500${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
      },
    });
    contactId = contact.id;
    const conv = await prisma.conversation.create({ data: { contactId, numeroId, naoLidas: 3 } });
    conversationId = conv.id;
  });

  afterAll(async () => {
    if (contactId) await prisma.contact.deleteMany({ where: { id: contactId } });
    if (numeroId) await prisma.whatsAppNumber.deleteMany({ where: { id: numeroId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('assume sob controle real, persiste pendente e enfileira só no fake', async () => {
    await expect(
      service.enviar(conversationId, userId, { texto: 'Resposta', assumir: false }),
    ).rejects.toMatchObject({ status: 409 });
    const dto = await service.enviar(conversationId, userId, {
      texto: 'Resposta segura',
      assumir: true,
    });
    expect(dto).toMatchObject({
      texto: 'Resposta segura',
      autor: 'atendente',
      status: 'pendente',
      autorUsuario: { id: userId },
    });
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(conv).toMatchObject({ estado: 'HUMANO', responsavelId: userId, versaoControle: 1 });
    expect(queued).toEqual([dto.id]);
    expect(await prisma.message.count({ where: { conversationId, tipo: 'evento' } })).toBe(1);
  });

  it('detalhe e leitura retornam o contrato persistido, nota fica fora da fila', async () => {
    const nota = await service.nota(conversationId, userId, { texto: 'Apenas equipe' });
    expect(nota.tipo).toBe('nota_interna');
    expect(queued).toHaveLength(1);
    const detalhe = await service.detalhe(conversationId);
    expect(detalhe).toMatchObject({
      conversa: { id: conversationId, naoLidas: 3 },
      contato: { id: contactId },
      oportunidade: null,
      resumo: null,
      itens: [],
      tarefasAbertas: [],
    });
    await service.ler(conversationId);
    expect(
      (await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).naoLidas,
    ).toBe(0);
    expect(emitted.at(-1)).toMatchObject({
      tipo: 'conversation.updated',
      payload: { conversa: { naoLidas: 0 } },
    });
  });

  it('busca por contato pagina sem perder mensagens e identifica demo fictícia', async () => {
    const lista = await service.listar({ busca: run }, userId);
    expect(lista.itens.map((c) => c.id)).toEqual([conversationId]);
    const primeira = await service.mensagens(conversationId, { limite: '2' });
    expect(primeira.itens).toHaveLength(2);
    expect(primeira.temMais).toBe(true);
    const anterior = await service.mensagens(conversationId, {
      antes: primeira.itens[0].id,
      limite: '2',
    });
    expect(anterior.itens).toHaveLength(1);
    expect(anterior.temMais).toBe(false);
    expect(new Set([...anterior.itens, ...primeira.itens].map((m) => m.id)).size).toBe(3);
  });
});
