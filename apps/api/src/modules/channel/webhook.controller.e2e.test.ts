import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../security/audit.service';
import type { EventosService } from '../realtime/eventos.service';
import type { ChannelHealthService } from './channel-health.service';
import type { ChannelPort } from './channel.port';
import { InboundReconciler } from './inbound-reconciler.service';
import { NumerosService } from './numeros.service';
import { WebhookController } from './webhook.controller';

/**
 * Usa o Postgres real do .env, mas só cria e apaga linhas com sufixo único desta execução.
 * Auditoria, eventos em tempo real e fila são dublês (audit_log é uma cadeia append-only).
 */
const TOKEN = 'token-teste-e2e';
const run = randomUUID().replace(/-/g, '').slice(0, 10);
const INSTANCIA = `t7-${run}`;
const E164_NUMERO = `+5500${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
const E164_CONTATO = `+5500${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
const idExt = (n: string) => `T7${run}${n}`;

function fixture(nome: string, trocas: Record<string, string> = {}): Record<string, unknown> {
  let txt = readFileSync(join(__dirname, '../../../test/fixtures/evolution', `${nome}.json`), 'utf8');
  txt = txt.replaceAll('"sales-hub"', `"${INSTANCIA}"`).replaceAll('5500900000001', E164_CONTATO.slice(1));
  for (const [de, para] of Object.entries(trocas)) txt = txt.replaceAll(de, para);
  const json = JSON.parse(txt) as Record<string, unknown>;
  return json;
}

/** A fixture traz timestamp de 2023; o webhook descarta histórico, então carimba "agora". */
function comTimestampAgora(payload: Record<string, unknown>): Record<string, unknown> {
  const data = payload.data as Record<string, unknown>;
  data.messageTimestamp = Math.floor(Date.now() / 1000);
  return payload;
}

describe('WebhookController (Postgres local)', () => {
  const prisma = new PrismaService();
  let numeroId: string;
  let controller: WebhookController;
  const adicionados: Array<{ nome: string; dados: unknown; opts: { jobId?: string } }> = [];
  const publicados: Array<{ tipo: string; payload: unknown }> = [];

  beforeAll(async () => {
    await prisma.$connect();
    const numero = await prisma.whatsAppNumber.create({
      data: { rotulo: `T7 ${run}`, e164: E164_NUMERO, instanciaEvolution: INSTANCIA, ficticio: true },
    });
    numeroId = numero.id;

    const config = {
      get: (k: string) => (k === 'EVOLUTION_WEBHOOK_TOKEN' ? TOKEN : undefined),
    } as unknown as ConfigService;
    const eventos = {
      publicar: vi.fn(async (tipo: string, payload: unknown) => {
        publicados.push({ tipo, payload });
      }),
    } as unknown as EventosService;
    const audit = { registrar: vi.fn(async () => undefined) } as unknown as AuditService;
    const numeros = new NumerosService(
      prisma,
      audit,
      eventos,
      {} as ChannelHealthService,
      {} as ChannelPort,
      config,
    );
    const fila = {
      add: vi.fn(async (nome: string, dados: unknown, opts: { jobId?: string }) => {
        adicionados.push({ nome, dados, opts });
      }),
    } as unknown as Queue;
    controller = new WebhookController(config, prisma, numeros, eventos, fila);
  });

  beforeEach(() => {
    adicionados.length = 0;
    publicados.length = 0;
  });

  afterAll(async () => {
    // beforeAll falhou: sem numeroId o filtro do Prisma seria ignorado e apagaria o banco inteiro
    if (!numeroId) {
      await prisma.$disconnect();
      return;
    }
    const contato = await prisma.contact.findUnique({ where: { e164: E164_CONTATO } });
    await prisma.message.deleteMany({ where: { numeroId } });
    await prisma.conversation.deleteMany({ where: { numeroId } });
    if (contato) await prisma.contact.delete({ where: { id: contato.id } });
    await prisma.inboundEvent.deleteMany({ where: { numeroId } });
    await prisma.whatsAppNumber.delete({ where: { id: numeroId } });
    await prisma.$disconnect();
  });

  const contarEventos = () => prisma.inboundEvent.count({ where: { numeroId } });

  it('token inválido: 200 sem efeito', async () => {
    const body = comTimestampAgora(fixture('texto'));
    const r1 = await controller.evolution(body, undefined, undefined, 'errado');
    const r2 = await controller.evolution(body);
    expect(r1).toEqual({ received: true });
    expect(r2).toEqual({ received: true });
    expect(await contarEventos()).toBe(0);
    expect(adicionados).toHaveLength(0);
  });

  it('token válido (por query, apikey ou header): grava InboundEvent com o evento normalizado e enfileira com jobId = idExterno', async () => {
    const body = comTimestampAgora(fixture('texto', { '3EB0A1B2C3D4E5F60001': idExt('A') }));
    await controller.evolution(body, undefined, undefined, TOKEN);

    const linhas = await prisma.inboundEvent.findMany({ where: { numeroId } });
    expect(linhas).toHaveLength(1);
    expect(linhas[0].idMensagem).toBe(idExt('A'));
    expect(linhas[0].resumo).toMatchObject({ tipo: 'mensagem', de: E164_CONTATO, tipoMensagem: 'texto', idExterno: idExt('A') });
    expect(JSON.stringify(linhas[0].resumo)).not.toContain('apikey'); // nunca o payload bruto

    expect(adicionados).toHaveLength(1);
    expect(adicionados[0].opts.jobId).toBe(idExt('A'));
    expect(adicionados[0].dados).toMatchObject({ inboundEventId: linhas[0].id, numeroId, evento: { idExterno: idExt('A') } });

    // outras formas de enviar o token
    const b2 = comTimestampAgora(fixture('texto', { '3EB0A1B2C3D4E5F60001': idExt('B') }));
    await controller.evolution(b2, TOKEN);
    const b3 = comTimestampAgora(fixture('texto', { '3EB0A1B2C3D4E5F60001': idExt('C') }));
    await controller.evolution(b3, undefined, TOKEN);
    expect(await contarEventos()).toBe(3);
  });

  it('apikey errado no header + ?token válido: aceita (qualquer candidato válido basta)', async () => {
    const body = comTimestampAgora(fixture('texto', { '3EB0A1B2C3D4E5F60001': idExt('G') }));
    await controller.evolution(body, 'outra-chave', undefined, TOKEN);
    expect(await prisma.inboundEvent.count({ where: { idMensagem: idExt('G') } })).toBe(1);
  });

  it('falha ao enfileirar: mantém a linha (reconciliador reenfileira)', async () => {
    const fila = { add: vi.fn(async () => { throw new Error('redis fora'); }) } as unknown as Queue;
    const cfg = { get: (k: string) => (k === 'EVOLUTION_WEBHOOK_TOKEN' ? TOKEN : undefined) } as unknown as ConfigService;
    const ctrl = new WebhookController(cfg, prisma, new NumerosService(prisma, {} as never, {} as never, {} as never, {} as never, cfg), {} as never, fila);
    const body = comTimestampAgora(fixture('texto', { '3EB0A1B2C3D4E5F60001': idExt('H') }));
    expect(await ctrl.evolution(body, undefined, undefined, TOKEN)).toEqual({ received: true });
    expect(await prisma.inboundEvent.count({ where: { idMensagem: idExt('H') } })).toBe(1);
  });

  it('reconciliador reenfileira linhas antigas, não processadas e sem job', async () => {
    const velho = new Date(Date.now() - 60_000);
    const evento = { tipo: 'mensagem', instancia: INSTANCIA, de: E164_CONTATO, idExterno: idExt('R'), fromMe: false, tipoMensagem: 'texto', timestamp: velho.toISOString() };
    const linha = await prisma.inboundEvent.create({ data: { idMensagem: idExt('R'), numeroId, resumo: evento, createdAt: velho } });
    const comJob = await prisma.inboundEvent.create({ data: { idMensagem: idExt('R2'), numeroId, resumo: { ...evento, idExterno: idExt('R2') }, createdAt: velho } });
    const adds: Array<{ dados: unknown; opts: { jobId?: string } }> = [];
    const fila = {
      getJob: vi.fn(async (id: string) => (id === idExt('R2') ? { id } : undefined)),
      add: vi.fn(async (_n: string, dados: unknown, opts: { jobId?: string }) => { adds.push({ dados, opts }); }),
    } as unknown as Queue;
    const rec = new InboundReconciler(prisma, fila);
    await rec.reconciliar();
    const meus = adds.filter((a) => (a.dados as { numeroId: string }).numeroId === numeroId);
    expect(meus).toHaveLength(1);
    expect(meus[0].opts.jobId).toBe(idExt('R'));
    expect(meus[0].dados).toMatchObject({ inboundEventId: linha.id, numeroId, evento: { idExterno: idExt('R') } });
    expect(comJob.id).not.toBe(linha.id);
  });

  it('jobId troca ":" por "."', async () => {
    const body = comTimestampAgora(fixture('texto', { '3EB0A1B2C3D4E5F60001': `${idExt('D')}:x` }));
    await controller.evolution(body, undefined, undefined, TOKEN);
    expect(adicionados[0].opts.jobId).toBe(`${idExt('D')}.x`);
  });

  it('mesmo idExterno duas vezes: 1 InboundEvent, 1 job', async () => {
    const body = comTimestampAgora(fixture('texto', { '3EB0A1B2C3D4E5F60001': idExt('E') }));
    await controller.evolution(body, undefined, undefined, TOKEN);
    await controller.evolution(body, undefined, undefined, TOKEN);
    expect(await prisma.inboundEvent.count({ where: { idMensagem: idExt('E') } })).toBe(1);
    expect(adicionados).toHaveLength(1);
  });

  it('instância desconhecida: ignora sem gravar', async () => {
    const body = comTimestampAgora(fixture('texto', { '3EB0A1B2C3D4E5F60001': idExt('F'), [INSTANCIA]: `${INSTANCIA}-x` }));
    await controller.evolution(body, undefined, undefined, TOKEN);
    expect(await prisma.inboundEvent.count({ where: { idMensagem: idExt('F') } })).toBe(0);
    expect(adicionados).toHaveLength(0);
  });

  it('evento status atualiza Message.status pelo (numeroId, idExterno) e publica message.updated', async () => {
    const contato = await prisma.contact.create({ data: { e164: E164_CONTATO, nome: 'T7' } });
    const conversa = await prisma.conversation.create({ data: { contactId: contato.id, numeroId } });
    const msg = await prisma.message.create({
      data: {
        conversationId: conversa.id,
        numeroId,
        autor: 'ia',
        texto: 'olá',
        status: 'enviada',
        idExterno: idExt('S'),
      },
    });
    const entrada = await prisma.message.create({
      data: { conversationId: conversa.id, numeroId, autor: 'cliente', texto: 'oi', idExterno: idExt('IN') },
    });

    // fixture status: READ para 3EB0A1B2C3D4E5F60099
    const lida = fixture('status', { '3EB0A1B2C3D4E5F60099': idExt('S') });
    await controller.evolution(lida, undefined, undefined, TOKEN);
    expect((await prisma.message.findUniqueOrThrow({ where: { id: msg.id } })).status).toBe('lida');
    expect(publicados).toEqual([
      { tipo: 'message.updated', payload: { conversationId: conversa.id, mensagemId: msg.id, status: 'lida' } },
    ]);

    // não regride: DELIVERY_ACK depois de READ
    publicados.length = 0;
    const entregue = fixture('status', { '3EB0A1B2C3D4E5F60099': idExt('S'), '"READ"': '"DELIVERY_ACK"' });
    await controller.evolution(entregue, undefined, undefined, TOKEN);
    expect((await prisma.message.findUniqueOrThrow({ where: { id: msg.id } })).status).toBe('lida');
    expect(publicados).toHaveLength(0);

    // mensagem de entrada (status nulo) não recebe ticks
    const emEntrada = fixture('status', { '3EB0A1B2C3D4E5F60099': idExt('IN') });
    await controller.evolution(emEntrada, undefined, undefined, TOKEN);
    expect((await prisma.message.findUniqueOrThrow({ where: { id: entrada.id } })).status).toBeNull();
    expect(publicados).toHaveLength(0);
  });

  it('reação publica message.updated com o emoji no alvo, sem persistir nem enfileirar', async () => {
    const contato = await prisma.contact.findUniqueOrThrow({ where: { e164: E164_CONTATO } });
    const conversa = await prisma.conversation.findFirstOrThrow({ where: { contactId: contato.id, numeroId } });
    const alvo = await prisma.message.create({
      data: { conversationId: conversa.id, numeroId, autor: 'ia', texto: 'oi', status: 'entregue', idExterno: idExt('R') },
    });
    const reacao = comTimestampAgora(fixture('reacao', { '3EB0A1B2C3D4E5F60099': idExt('R') }));
    await controller.evolution(reacao, undefined, undefined, TOKEN);
    expect(publicados).toHaveLength(1);
    expect(publicados[0]).toMatchObject({
      tipo: 'message.updated',
      payload: { conversationId: conversa.id, mensagemId: alvo.id, reacao: '👍' },
    });
    expect(adicionados).toHaveLength(0);
    expect(await prisma.message.count({ where: { conversationId: conversa.id, texto: '👍' } })).toBe(0);
  });

  it('evento contato preenche o nome só quando vazio', async () => {
    const contato = await prisma.contact.findUniqueOrThrow({ where: { e164: E164_CONTATO } });
    const ev = (nome: string) => ({
      event: 'contacts.upsert',
      instance: INSTANCIA,
      data: { remoteJid: `${E164_CONTATO.slice(1)}@s.whatsapp.net`, pushName: nome },
    });
    await controller.evolution(ev('Outro Nome'), undefined, undefined, TOKEN);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: contato.id } })).nome).toBe('T7'); // já tinha nome
    await prisma.contact.update({ where: { id: contato.id }, data: { nome: null } });
    await controller.evolution(ev('Nome Novo'), undefined, undefined, TOKEN);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: contato.id } })).nome).toBe('Nome Novo');
  });

  it('evento conexao atualiza WhatsAppNumber.estado e publica number.status (só quando muda)', async () => {
    await controller.evolution(fixture('conexao'), undefined, undefined, TOKEN); // open
    expect((await prisma.whatsAppNumber.findUniqueOrThrow({ where: { id: numeroId } })).estado).toBe('conectado');
    expect(publicados).toHaveLength(1);
    expect(publicados[0]).toMatchObject({ tipo: 'number.status', payload: { numero: { id: numeroId, estado: 'conectado' } } });

    await controller.evolution(fixture('conexao'), undefined, undefined, TOKEN); // repetido: sem novo evento
    expect(publicados).toHaveLength(1);

    const fechou = fixture('conexao', { '"open"': '"close"' });
    await controller.evolution(fechou, undefined, undefined, TOKEN);
    expect((await prisma.whatsAppNumber.findUniqueOrThrow({ where: { id: numeroId } })).estado).toBe('desconectado');
    expect(publicados).toHaveLength(2);
  });

  it('payload malformado: 200 sem erro', async () => {
    expect(await controller.evolution({ lixo: true }, undefined, undefined, TOKEN)).toEqual({ received: true });
    expect(await controller.evolution(null, undefined, undefined, TOKEN)).toEqual({ received: true });
  });
});
