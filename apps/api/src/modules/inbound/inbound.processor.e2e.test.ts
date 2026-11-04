import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import type { EventoMensagem, InboundJob } from '../channel/channel.port';
import type { EventosService } from '../realtime/eventos.service';
import type { SettingsService } from '../security/settings.service';
import { InboundProcessor } from './inbound.processor';

/**
 * Postgres real do .env. Cria só linhas com telefones únicos desta execução (faixa +5500)
 * e apaga só elas no afterAll. Filas e eventos são dublês.
 */
const run = randomUUID().replace(/-/g, '').slice(0, 10);
const rnd = () => `+5500${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
const E164_NUMERO = rnd();
const contatos: string[] = [];
const novoContato = () => {
  const e = rnd();
  contatos.push(e);
  return e;
};
let seq = 0;
const idExt = () => `T8${run}${++seq}`;

describe('InboundProcessor (Postgres local)', () => {
  const prisma = new PrismaService();
  let numeroId: string;
  let proc: InboundProcessor;
  let iaGlobal = true;
  const add = vi.fn(async (..._a: unknown[]) => undefined);
  const publicados: Array<{ tipo: string; payload: Record<string, unknown> }> = [];

  beforeAll(async () => {
    await prisma.$connect();
    const n = await prisma.whatsAppNumber.create({
      data: { rotulo: `T8 ${run}`, e164: E164_NUMERO, instanciaEvolution: `t8-${run}`, ficticio: true },
    });
    numeroId = n.id;
    const eventos = {
      publicar: vi.fn(async (tipo: string, payload: Record<string, unknown>) => {
        publicados.push({ tipo, payload });
      }),
    } as unknown as EventosService;
    const settings = { iaGlobalAtiva: async () => iaGlobal } as unknown as SettingsService;
    const config = { get: (k: string) => (k === 'AGENT_DEBOUNCE_MS' ? 3000 : undefined) } as unknown as ConfigService;
    proc = new InboundProcessor(prisma, eventos, settings, { add } as unknown as Queue, config);
  });

  beforeEach(() => {
    add.mockClear();
    publicados.length = 0;
    iaGlobal = true;
  });

  afterAll(async () => {
    await prisma.contact.deleteMany({ where: { e164: { in: contatos } } }); // cascata: conversas e mensagens
    await prisma.inboundEvent.deleteMany({ where: { numeroId } });
    await prisma.whatsAppNumber.delete({ where: { id: numeroId } });
    await prisma.$disconnect();
  });

  async function enviar(
    de: string,
    over: Partial<EventoMensagem> = {},
  ): Promise<{ idExterno: string; inboundEventId: string }> {
    const evento: EventoMensagem = {
      tipo: 'mensagem',
      instancia: `t8-${run}`,
      de,
      idExterno: idExt(),
      fromMe: false,
      tipoMensagem: 'texto',
      texto: 'olá, quero um orçamento',
      pushName: 'Maria Teste',
      timestamp: new Date().toISOString(),
      ...over,
    };
    const ie = await prisma.inboundEvent.create({
      data: { idMensagem: evento.idExterno, numeroId, resumo: evento as never },
    });
    const data: InboundJob = { inboundEventId: ie.id, numeroId, evento };
    await proc.process({ id: evento.idExterno, data } as Job<InboundJob>);
    return { idExterno: evento.idExterno, inboundEventId: ie.id };
  }

  const conversa = (e164: string) =>
    prisma.conversation.findFirstOrThrow({ where: { contact: { e164 }, numeroId }, include: { contact: true } });

  it('cria Contact (pushName), Conversation IA_ATIVA e Message cliente; publica message.created e conversation.updated', async () => {
    const e164 = novoContato();
    const { idExterno } = await enviar(e164);
    const conv = await conversa(e164);
    expect(conv.contact.nome).toBe('Maria Teste');
    expect(conv.estado).toBe('IA_ATIVA');
    const msg = await prisma.message.findUniqueOrThrow({ where: { numeroId_idExterno: { numeroId, idExterno } } });
    expect(msg).toMatchObject({ autor: 'cliente', tipo: 'texto', texto: 'olá, quero um orçamento', conversationId: conv.id });
    expect(msg.status).toBeNull();
    const tipos = publicados.map((p) => p.tipo);
    expect(tipos).toContain('message.created');
    expect(tipos).toContain('conversation.updated');
    const criada = publicados.find((p) => p.tipo === 'message.created')!;
    expect((criada.payload.mensagem as { id: string }).id).toBe(msg.id);
  });

  it('segunda mensagem reaproveita a mesma conversa (única por contato+número)', async () => {
    const e164 = novoContato();
    await enviar(e164);
    await enviar(e164, { texto: 'mais uma' });
    const total = await prisma.conversation.count({ where: { contact: { e164 }, numeroId } });
    expect(total).toBe(1);
  });

  it('incrementa naoLidas, atualiza ultimaMensagemClienteEm e janelaAteEm = +24h', async () => {
    const e164 = novoContato();
    await enviar(e164);
    await enviar(e164, { texto: 'segunda' });
    const conv = await conversa(e164);
    expect(conv.naoLidas).toBe(2);
    expect(conv.ultimaMensagemClienteEm).not.toBeNull();
    expect(conv.ultimaMensagemEm).not.toBeNull();
    expect(conv.janelaAteEm!.getTime() - conv.ultimaMensagemClienteEm!.getTime()).toBe(24 * 3600 * 1000);
  });

  it('agenda turno com delay 3000 quando conversa IA_ATIVA e IA global ligada', async () => {
    const e164 = novoContato();
    await enviar(e164);
    const conv = await conversa(e164);
    expect(add).toHaveBeenCalledTimes(1);
    const [nome, dados, opts] = add.mock.calls[0] as unknown as [string, unknown, { delay: number; jobId: string }];
    expect(nome).toBe('turn');
    expect(dados).toEqual({ conversationId: conv.id });
    expect(opts.delay).toBe(3000);
    expect(opts.jobId).not.toContain(':');
  });

  it('não agenda turno com a IA global desligada', async () => {
    iaGlobal = false;
    await enviar(novoContato());
    expect(add).not.toHaveBeenCalled();
  });

  it('mensagem em conversa HUMANO não agenda turno', async () => {
    const e164 = novoContato();
    await enviar(e164);
    await prisma.conversation.updateMany({ where: { contact: { e164 }, numeroId }, data: { estado: 'HUMANO' } });
    add.mockClear();
    await enviar(e164, { texto: 'alguém aí?' });
    expect(add).not.toHaveBeenCalled();
    expect((await conversa(e164)).estado).toBe('HUMANO');
  });

  it('mensagem em conversa ENCERRADA reabre em IA_ATIVA (versaoControle+1) e agenda turno', async () => {
    const e164 = novoContato();
    await enviar(e164);
    await prisma.conversation.updateMany({
      where: { contact: { e164 }, numeroId },
      data: { estado: 'ENCERRADA', versaoControle: 4 },
    });
    add.mockClear();
    await enviar(e164, { texto: 'voltei' });
    const conv = await conversa(e164);
    expect(conv.estado).toBe('IA_ATIVA');
    expect(conv.versaoControle).toBe(5);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('pré-classificação de emergência marca prioridade emergencia e publica conversation.updated antes do turno', async () => {
    const e164 = novoContato();
    const ordem: string[] = [];
    publicados.length = 0;
    add.mockImplementationOnce(async () => {
      ordem.push(`add após ${publicados.filter((p) => p.tipo === 'conversation.updated').length} conversation.updated`);
    });
    await enviar(e164, { texto: 'sofri um acidente, preciso de ajuda' });
    expect((await conversa(e164)).prioridade).toBe('emergencia');
    const ultimo = publicados.filter((p) => p.tipo === 'conversation.updated').at(-1)!;
    expect((ultimo.payload.conversa as { prioridade: string }).prioridade).toBe('emergencia');
    expect(ordem).toEqual(['add após 1 conversation.updated']);
  });

  it('eco fromMe de mensagem enviada pelo sistema (idExterno conhecido) não cria Message', async () => {
    const e164 = novoContato();
    await enviar(e164);
    const conv = await conversa(e164);
    const idSistema = idExt();
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        numeroId,
        autor: 'ia',
        texto: 'Olá!',
        status: 'enviada',
        idExterno: idSistema,
      },
    });
    const antes = await prisma.message.count({ where: { conversationId: conv.id } });
    add.mockClear();
    publicados.length = 0;
    await enviar(e164, { fromMe: true, idExterno: idSistema, texto: 'Olá!' });
    expect(await prisma.message.count({ where: { conversationId: conv.id } })).toBe(antes);
    expect(add).not.toHaveBeenCalled();
    expect(publicados.filter((p) => p.tipo === 'message.created')).toHaveLength(0);
  });

  it('eco fromMe que chega antes do idExterno ser gravado casa por texto e define idExterno', async () => {
    const e164 = novoContato();
    await enviar(e164);
    const conv = await conversa(e164);
    const pendente = await prisma.message.create({
      data: { conversationId: conv.id, numeroId, autor: 'ia', texto: 'Posso ajudar?', status: 'enviando' },
    });
    const antes = await prisma.message.count({ where: { conversationId: conv.id } });
    add.mockClear();
    const novoId = idExt();
    await enviar(e164, { fromMe: true, idExterno: novoId, texto: 'Posso ajudar?' });
    expect(await prisma.message.count({ where: { conversationId: conv.id } })).toBe(antes);
    const atualizada = await prisma.message.findUniqueOrThrow({ where: { id: pendente.id } });
    expect(atualizada.idExterno).toBe(novoId);
    expect(atualizada.autor).toBe('ia');
    expect(add).not.toHaveBeenCalled();
  });

  it('fromMe sem Message correspondente cria Message autor atendente ("enviada pelo celular") e não agenda turno', async () => {
    const e164 = novoContato();
    await enviar(e164);
    add.mockClear();
    const id = idExt();
    await enviar(e164, { fromMe: true, idExterno: id, texto: 'Digitei no celular', pushName: 'Operador' });
    const conv = await conversa(e164);
    const msg = await prisma.message.findUniqueOrThrow({ where: { numeroId_idExterno: { numeroId, idExterno: id } } });
    expect(msg).toMatchObject({ autor: 'atendente', status: 'enviada', texto: 'Digitei no celular', conversationId: conv.id });
    expect(add).not.toHaveBeenCalled();
    expect(conv.contact.nome).toBe('Maria Teste'); // pushName de fromMe é o nosso, não do contato
  });

  it('mídia vira texto descritivo com o tipo correspondente', async () => {
    const e164 = novoContato();
    const casos = [
      ['audio', '[o cliente enviou um áudio]'],
      ['imagem', '[o cliente enviou uma imagem]'],
      ['documento', '[o cliente enviou um documento]'],
      ['video', '[o cliente enviou um vídeo]'],
    ] as const;
    for (const [tipoMensagem, texto] of casos) {
      const { idExterno } = await enviar(e164, { tipoMensagem, texto: undefined });
      const m = await prisma.message.findUniqueOrThrow({ where: { numeroId_idExterno: { numeroId, idExterno } } });
      expect(m).toMatchObject({ tipo: tipoMensagem, texto });
    }
  });

  it('figurinha é gravada e não agenda turno', async () => {
    const e164 = novoContato();
    const { idExterno } = await enviar(e164, { tipoMensagem: 'figurinha', texto: undefined });
    const m = await prisma.message.findUniqueOrThrow({ where: { numeroId_idExterno: { numeroId, idExterno } } });
    expect(m.tipo).toBe('figurinha');
    expect(add).not.toHaveBeenCalled();
  });

  it('reentrega do mesmo idExterno não duplica a Message nem agenda outro turno', async () => {
    const e164 = novoContato();
    const id = idExt();
    await enviar(e164, { idExterno: id });
    // novo InboundEvent não é possível (unique), então reprocessa o job direto
    const ie = await prisma.inboundEvent.findUniqueOrThrow({ where: { idMensagem: id } });
    add.mockClear();
    const evento = ie.resumo as unknown as EventoMensagem;
    await proc.process({ id, data: { inboundEventId: ie.id, numeroId, evento } } as Job<InboundJob>);
    expect(await prisma.message.count({ where: { numeroId, idExterno: id } })).toBe(1);
    expect(add).not.toHaveBeenCalled();
  });

  it('marca InboundEvent.processedAt', async () => {
    const { inboundEventId } = await enviar(novoContato());
    const ie = await prisma.inboundEvent.findUniqueOrThrow({ where: { id: inboundEventId } });
    expect(ie.processedAt).not.toBeNull();
  });
});
