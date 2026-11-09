import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { TEXTO_CONTINGENCIA, TEXTO_EMERGENCIA } from '@sales-hub/shared';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '../../queue/queue.constants';
import { parseRedisUrl } from '../../queue/redis-connection';
import type { ChannelPort } from '../channel/channel.port';
import { OutboundService } from '../outbound/outbound.service';
import type { EventosService } from '../realtime/eventos.service';
import type { AuditService, EntradaAuditoria } from '../security/audit.service';
import type { SettingsService } from '../security/settings.service';
import { ControleService } from './controle.service';

/**
 * Postgres e Redis reais do .env. Só cria e apaga linhas com sufixo único desta execução; fila com
 * prefixo próprio e sem worker (os jobs ficam esperando, o que permite conferir a remoção).
 * Nada aqui toca linhas globais: o interruptor geral fica em `controle.ia-global.e2e.test.ts`.
 */
const run = randomUUID().replace(/-/g, '').slice(0, 10);
const novoE164 = () => `+5500${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('ControleService (Postgres + Redis locais)', () => {
  const prisma = new PrismaService();
  const conexao = parseRedisUrl(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const prefix = `t9c-${run}`;
  const auditorias: EntradaAuditoria[] = [];
  const publicados: Array<{ tipo: string; payload: Record<string, unknown> }> = [];
  const presencas: Array<{ instancia: string; para: string; estado: string; duracaoMs: number; em: number }> = [];
  const estado = { demoMode: false, permitidos: [] as string[], falharPresenca: false };
  const contatos: string[] = [];
  let numeroId: string;
  let ana: { id: string; nome: string };
  let bruno: { id: string; nome: string };
  let setor: { id: string; nome: string };
  let fila: Queue;
  let saida: OutboundService;
  let controle: ControleService;

  async function novaConversa() {
    const contato = await prisma.contact.create({ data: { e164: novoE164(), nome: `T9 ${run}` } });
    contatos.push(contato.id);
    const c = await prisma.conversation.create({ data: { contactId: contato.id, numeroId } });
    return Object.assign(c, { e164: contato.e164 });
  }

  async function bolhaPendente(c: { id: string; versaoControle: number }, texto: string) {
    const m = await prisma.message.create({
      data: { conversationId: c.id, numeroId, autor: 'ia', texto, status: 'pendente', versaoControle: c.versaoControle },
    });
    await saida.enfileirar(m.id, 2000);
    return m;
  }

  const conversa = (id: string) => prisma.conversation.findUniqueOrThrow({ where: { id } });
  const mensagem = (id: string) => prisma.message.findUniqueOrThrow({ where: { id } });
  const eventosDaConversa = (conversationId: string) =>
    prisma.message.findMany({ where: { conversationId, tipo: 'evento' }, orderBy: { criadaEm: 'asc' } });
  const novoTurno = (c: { id: string; versaoControle: number }) =>
    prisma.agentTurn.create({
      data: { conversationId: c.id, iniciadoEm: new Date(), modelo: 'teste', versaoControle: c.versaoControle },
    });

  beforeAll(async () => {
    await prisma.$connect();
    const numero = await prisma.whatsAppNumber.create({
      data: { rotulo: `T9C ${run}`, e164: novoE164(), instanciaEvolution: `t9c-${run}`, estado: 'conectado', ficticio: true },
    });
    numeroId = numero.id;
    ana = await prisma.user.create({
      data: { nome: `Ana Ribeiro T9${run}`, email: `ana.t9c.${run}@teste.local`, papel: 'atendente', senhaHash: 'x' },
      select: { id: true, nome: true },
    });
    bruno = await prisma.user.create({
      data: { nome: `Bruno Costa T9${run}`, email: `bruno.t9c.${run}@teste.local`, papel: 'atendente', senhaHash: 'x' },
      select: { id: true, nome: true },
    });
    setor = await prisma.sector.create({ data: { nome: `Suporte T9${run}` } });

    const eventos = {
      publicar: vi.fn(async (tipo: string, payload: Record<string, unknown>) => {
        publicados.push({ tipo, payload });
      }),
    } as unknown as EventosService;
    const audit = {
      registrar: vi.fn(async (e: EntradaAuditoria) => {
        auditorias.push(e);
      }),
    } as unknown as AuditService;
    const canal = {
      enviarPresenca: vi.fn(async (instancia: string, para: string, est: string, duracaoMs: number) => {
        if (estado.falharPresenca) throw new Error('Evolution fora do ar (teste)');
        presencas.push({ instancia, para, estado: est, duracaoMs, em: Date.now() });
      }),
    } as unknown as ChannelPort;
    const settings = { numerosPermitidos: async () => estado.permitidos } as unknown as SettingsService;
    const config = { get: (k: string) => (k === 'DEMO_MODE' ? estado.demoMode : undefined) } as unknown as ConfigService;
    fila = new Queue(QUEUES.OUTBOUND, { connection: conexao, prefix });
    saida = new OutboundService(fila, prisma, eventos);
    controle = new ControleService(prisma, audit, eventos, saida, canal, settings, config);
  });

  beforeEach(() => {
    auditorias.length = 0;
    publicados.length = 0;
    presencas.length = 0;
    estado.demoMode = false;
    estado.permitidos = [];
    estado.falharPresenca = false;
  });

  afterAll(async () => {
    await fila?.obliterate({ force: true });
    await fila?.close();
    await prisma.message.deleteMany({ where: { numeroId } });
    await prisma.conversation.deleteMany({ where: { numeroId } });
    await prisma.contact.deleteMany({ where: { id: { in: contatos } } });
    await prisma.whatsAppNumber.delete({ where: { id: numeroId } });
    await prisma.user.deleteMany({ where: { id: { in: [ana.id, bruno.id] } } });
    await prisma.sector.delete({ where: { id: setor.id } });
    await prisma.$disconnect();
  });

  it('assumir: HUMANO, responsável = ator, versão +1, evento na conversa, automáticas pendentes canceladas', async () => {
    const c = await novaConversa();
    const b1 = await bolhaPendente(c, 'bolha 1');
    const b2 = await bolhaPendente(c, 'bolha 2');
    expect(await fila.getJob(b1.id)).toBeDefined();

    await controle.assumir(c.id, ana.id);

    const depois = await conversa(c.id);
    expect(depois).toMatchObject({ estado: 'HUMANO', responsavelId: ana.id, versaoControle: c.versaoControle + 1 });
    const [evento] = await eventosDaConversa(c.id);
    expect(evento).toMatchObject({
      autor: 'sistema',
      tipo: 'evento',
      texto: `${ana.nome} assumiu o atendimento`,
      status: null,
    });
    for (const b of [b1, b2]) {
      const m = await mensagem(b.id);
      expect(m.status).toBe('cancelada');
      expect(m.motivoFalha).toBe('Atendimento assumido');
      expect(await fila.getJob(b.id)).toBeUndefined(); // job removido do BullMQ
      expect(publicados).toContainEqual({
        tipo: 'message.updated',
        payload: { conversationId: c.id, mensagemId: b.id, status: 'cancelada', motivoFalha: 'Atendimento assumido' },
      });
    }
    expect(auditorias).toContainEqual(
      expect.objectContaining({ ator: `usuario_painel:${ana.id}`, acao: 'conversa.assumir', entidade: 'conversation', entidadeId: c.id }),
    );
    expect(publicados).toContainEqual({
      tipo: 'conversation.updated',
      payload: { conversa: expect.objectContaining({ id: c.id, estado: 'HUMANO', responsavel: ana }) },
    });
    expect(publicados).toContainEqual({
      tipo: 'message.created',
      payload: { conversationId: c.id, mensagem: expect.objectContaining({ id: evento.id, tipo: 'evento', autor: 'sistema' }) },
    });
  });

  it('devolver: IA_ATIVA; nada além de devolver leva de volta a IA_ATIVA', async () => {
    const c = await novaConversa();
    const estados: string[] = [];
    const passo = async (f: () => Promise<void>) => {
      await f();
      estados.push((await conversa(c.id)).estado);
    };
    await passo(() => controle.pausar(c.id, ana.id));
    await passo(() => controle.transferir(c.id, ana.id, { setorId: setor.id }));
    await passo(() => controle.transferir(c.id, ana.id, { usuarioId: bruno.id }, 'Cliente quer falar do plano para empresas'));
    await passo(() => controle.encerrar(c.id, ana.id, 'cliente desistiu'));
    await passo(() => controle.assumir(c.id, ana.id));
    expect(estados).toEqual(['IA_PAUSADA', 'AGUARDANDO_ESPECIALISTA', 'HUMANO', 'ENCERRADA', 'HUMANO']);
    expect(estados).not.toContain('IA_ATIVA');

    await controle.devolver(c.id, ana.id);
    const final = await conversa(c.id);
    expect(final).toMatchObject({ estado: 'IA_ATIVA', responsavelId: null, versaoControle: c.versaoControle + 6 });

    const textos = (await eventosDaConversa(c.id)).map((m) => m.texto);
    expect(textos).toEqual([
      `${ana.nome} pausou a IA`,
      `${ana.nome} transferiu o atendimento para ${setor.nome}`,
      `${ana.nome} transferiu o atendimento para ${bruno.nome}`,
      `${ana.nome} encerrou o atendimento: cliente desistiu`,
      `${ana.nome} assumiu o atendimento`,
      `${ana.nome} devolveu o atendimento à IA`,
    ]);

    // a nota da transferência é interna: nunca vai para a fila de saída
    const nota = await prisma.message.findFirstOrThrow({ where: { conversationId: c.id, tipo: 'nota_interna' } });
    expect(nota).toMatchObject({ autor: 'atendente', autorUsuarioId: ana.id, texto: 'Cliente quer falar do plano para empresas', status: null });
    expect(await fila.getJob(nota.id)).toBeUndefined();
  });

  it('devolver só por pessoa: ator sistema → ForbiddenException e conversa intacta', async () => {
    const c = await novaConversa();
    await controle.assumir(c.id, ana.id);
    const antes = await conversa(c.id);
    publicados.length = 0;

    const erro = await controle.devolver(c.id, 'sistema').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ForbiddenException);
    expect((erro as Error).message).toMatch(/pessoa/);
    expect(await conversa(c.id)).toMatchObject({ estado: 'HUMANO', responsavelId: ana.id, versaoControle: antes.versaoControle });
    expect(await eventosDaConversa(c.id)).toHaveLength(1);
    expect(publicados).toHaveLength(0);
  });

  it('sem mudança real (devolver em IA_ATIVA, assumir repetido): sem versão +1, sem evento, a IA segue', async () => {
    const c = await novaConversa();
    const b = await bolhaPendente(c, 'resposta em andamento');

    await controle.devolver(c.id, ana.id); // já está em IA_ATIVA
    expect((await conversa(c.id)).versaoControle).toBe(c.versaoControle);
    expect(await eventosDaConversa(c.id)).toHaveLength(0);
    expect(await mensagem(b.id)).toMatchObject({ status: 'pendente' });
    expect(await fila.getJob(b.id)).toBeDefined();
    expect(auditorias).toHaveLength(0);
    expect(publicados).toHaveLength(0);

    await controle.assumir(c.id, ana.id);
    await controle.assumir(c.id, ana.id); // repetido pela mesma pessoa
    expect((await conversa(c.id)).versaoControle).toBe(c.versaoControle + 1);
    expect(await eventosDaConversa(c.id)).toHaveLength(1);

    // outra pessoa assumindo é mudança de responsável
    await controle.assumir(c.id, bruno.id);
    expect(await conversa(c.id)).toMatchObject({ responsavelId: bruno.id, versaoControle: c.versaoControle + 2 });

    // transferência para o mesmo setor em que já está: nada muda, mas a nota é guardada
    await controle.transferir(c.id, ana.id, { setorId: setor.id });
    const v = (await conversa(c.id)).versaoControle;
    await controle.transferir(c.id, ana.id, { setorId: setor.id }, 'mesma fila');
    expect((await conversa(c.id)).versaoControle).toBe(v);
    expect(await prisma.message.count({ where: { conversationId: c.id, tipo: 'nota_interna', texto: 'mesma fila' } })).toBe(1);
  });

  it('transferir para setor: AGUARDANDO_ESPECIALISTA com setorId', async () => {
    const c = await novaConversa();
    const b = await bolhaPendente(c, 'bolha');
    await controle.transferir(c.id, ana.id, { setorId: setor.id });

    expect(await conversa(c.id)).toMatchObject({
      estado: 'AGUARDANDO_ESPECIALISTA',
      setorId: setor.id,
      responsavelId: null,
      versaoControle: c.versaoControle + 1,
    });
    expect((await mensagem(b.id)).status).toBe('cancelada');

    // pela IA (ator sistema): sem busca de usuário, texto e auditoria do sistema
    const c2 = await novaConversa();
    await controle.transferir(c2.id, 'sistema', { setorId: setor.id });
    expect((await conversa(c2.id)).estado).toBe('AGUARDANDO_ESPECIALISTA');
    const [ev] = await eventosDaConversa(c2.id);
    expect(ev.texto).toBe(`A IA transferiu o atendimento para ${setor.nome}`);
    expect(auditorias).toContainEqual(expect.objectContaining({ ator: 'sistema', acao: 'conversa.transferir', entidadeId: c2.id }));

    // para uma pessoa: HUMANO com responsável
    await controle.transferir(c2.id, ana.id, { usuarioId: bruno.id });
    expect(await conversa(c2.id)).toMatchObject({ estado: 'HUMANO', responsavelId: bruno.id });

    await expect(controle.transferir(c2.id, ana.id, {})).rejects.toThrow();
  });

  it('contingência com versão é cancelada ao assumir; texto fixo sem versão (emergência) continua na fila', async () => {
    const c = await novaConversa();
    const contingencia = await saida.criarMensagemSistema({
      conversationId: c.id,
      texto: TEXTO_CONTINGENCIA,
      versao: c.versaoControle,
    });
    const emergencia = await saida.criarMensagemSistema({ conversationId: c.id, texto: TEXTO_EMERGENCIA });
    expect(await mensagem(contingencia)).toMatchObject({ autor: 'sistema', versaoControle: c.versaoControle, status: 'pendente' });

    await controle.assumir(c.id, ana.id);

    expect(await mensagem(contingencia)).toMatchObject({ status: 'cancelada', motivoFalha: 'Atendimento assumido' });
    expect(await fila.getJob(contingencia)).toBeUndefined();
    expect(await mensagem(emergencia)).toMatchObject({ status: 'pendente', versaoControle: null });
    expect(await fila.getJob(emergencia)).toBeDefined();
  });

  it('sair de IA_ATIVA desliga o digitando na hora: agent.typing false e presença paused (respeita a trava demo)', async () => {
    const c = await novaConversa();
    await controle.assumir(c.id, ana.id);
    expect(publicados).toContainEqual({ tipo: 'agent.typing', payload: { conversationId: c.id, ativo: false } });
    await dormir(100); // presença é disparada sem aguardar
    expect(presencas.filter((p) => p.para === c.e164)).toEqual([
      expect.objectContaining({ instancia: `t9c-${run}`, estado: 'paused', duracaoMs: 0 }),
    ]);

    // já fora de IA_ATIVA: não repete
    presencas.length = 0;
    publicados.length = 0;
    await controle.transferir(c.id, ana.id, { setorId: setor.id });
    await dormir(100);
    expect(presencas).toHaveLength(0);
    expect(publicados.filter((p) => p.tipo === 'agent.typing')).toHaveLength(0);

    // demo: destino fora da lista não recebe presença; o painel recebe o agent.typing
    estado.demoMode = true;
    const d = await novaConversa();
    await controle.pausar(d.id, ana.id);
    await dormir(100);
    expect(presencas).toHaveLength(0);
    expect(publicados).toContainEqual({ tipo: 'agent.typing', payload: { conversationId: d.id, ativo: false } });

    // erro do canal na presença não derruba a ação
    estado.demoMode = false;
    estado.falharPresenca = true;
    const e = await novaConversa();
    await expect(controle.assumir(e.id, ana.id)).resolves.toBeUndefined();
    expect((await conversa(e.id)).estado).toBe('HUMANO');
  });

  it('criarBolhasIa com versão velha ou fora de IA_ATIVA não cria bolha (sem bolha fantasma depois do clique)', async () => {
    const c = await novaConversa();
    const turno = await novoTurno(c);
    const bolhas = (versao: number) =>
      saida.criarBolhasIa({ conversationId: c.id, textos: ['fantasma'], agentTurnId: turno.id, versao });

    await controle.assumir(c.id, ana.id); // versão +1, HUMANO
    expect(await bolhas(c.versaoControle)).toEqual([]); // versão velha
    expect(await bolhas(c.versaoControle + 1)).toEqual([]); // versão atual, mas HUMANO
    await controle.devolver(c.id, ana.id); // IA_ATIVA, versão +2
    expect(await bolhas(c.versaoControle + 1)).toEqual([]); // IA_ATIVA, versão velha
    expect(await prisma.message.count({ where: { conversationId: c.id, autor: 'ia' } })).toBe(0);
    expect(publicados.filter((p) => p.tipo === 'message.created' && (p.payload.mensagem as { autor: string }).autor === 'ia')).toHaveLength(0);

    expect(await bolhas(c.versaoControle + 2)).toHaveLength(1);
  });

  it('criarBolhasIa: Message ia pendente com a versão do turno; job enviar com jobId = messageId, delay 0 e digitando de 2 a 5 s', async () => {
    const c = await novaConversa();
    const turno = await novoTurno(c);
    const ids = await saida.criarBolhasIa({
      conversationId: c.id,
      textos: ['Oi!', 'Quantas pessoas vão usar?'],
      agentTurnId: turno.id,
      versao: c.versaoControle,
    });
    expect(ids).toHaveLength(2);
    const msgs = await prisma.message.findMany({ where: { id: { in: ids } }, orderBy: { criadaEm: 'asc' } });
    expect(msgs.map((m) => m.texto)).toEqual(['Oi!', 'Quantas pessoas vão usar?']);
    for (const m of msgs) {
      expect(m).toMatchObject({ autor: 'ia', tipo: 'texto', status: 'pendente', versaoControle: c.versaoControle, agentTurnId: turno.id });
      const job = await fila.getJob(m.id);
      expect(job?.name).toBe('enviar');
      expect(job?.id).toBe(m.id);
      expect(job?.opts.delay ?? 0).toBe(0);
      expect(job?.data.messageId).toBe(m.id);
      expect(job?.data.digitandoMs).toBeGreaterThanOrEqual(2000);
      expect(job?.data.digitandoMs).toBeLessThanOrEqual(5000);
    }
    expect(publicados.filter((p) => p.tipo === 'message.created')).toHaveLength(2);
  });
});
