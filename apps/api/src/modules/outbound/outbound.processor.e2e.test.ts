import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { Message } from '@prisma/client';
import { Queue, Worker, type Job } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '../../queue/queue.constants';
import { parseRedisUrl } from '../../queue/redis-connection';
import type { ChannelPort } from '../channel/channel.port';
import { ControleService } from '../controle/controle.service';
import type { EventosService } from '../realtime/eventos.service';
import type { AuditService } from '../security/audit.service';
import type { SettingsService } from '../security/settings.service';
import { TEXTO_MOTIVO_ENVIO } from './outbound.motivos';
import { OPCOES_WORKER_SAIDA, OutboundProcessor, type JobEnvio } from './outbound.processor';
import { OutboundService } from './outbound.service';

/**
 * Postgres e Redis reais do .env. Só cria e apaga linhas com sufixo
 * único desta execução; a fila usa um prefixo próprio (não encosta em `bull:*`). Canal, eventos,
 * auditoria e settings são dublês. Relógio real com "digitando" curto.
 */
const run = randomUUID().replace(/-/g, '').slice(0, 10);
const INSTANCIA = `t9-${run}`;
const novoE164 = () => `+5500${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

interface Chamada {
  tipo: 'texto' | 'presenca';
  em: number;
  instancia: string;
  para: string;
  texto?: string;
  presenca?: string;
  duracaoMs?: number;
}

async function esperarAte<T>(f: () => Promise<T | null | undefined | false>, ms = 10_000): Promise<T> {
  const fim = Date.now() + ms;
  for (;;) {
    const v = await f();
    if (v) return v;
    if (Date.now() > fim) throw new Error('timeout esperando condição');
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('OutboundProcessor (Postgres + Redis locais)', () => {
  const prisma = new PrismaService();
  const conexao = parseRedisUrl(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const prefix = `t9p-${run}`;
  const estado = { demoMode: false, permitidos: [] as string[], iaGlobal: true, falharTexto: false };
  const chamadas: Chamada[] = [];
  const publicados: Array<{ tipo: string; payload: Record<string, unknown>; em: number }> = [];
  const jobsProcessados: string[] = [];
  const contatos: string[] = [];
  let numeroId: string;
  let usuarioId: string;
  let fila: Queue;
  let worker: Worker;
  let processor: OutboundProcessor;
  let saida: OutboundService;
  let controle: ControleService;
  let seq = 0;

  const canal = {
    enviarTexto: vi.fn(async (instancia: string, para: string, texto: string) => {
      chamadas.push({ tipo: 'texto', em: Date.now(), instancia, para, texto });
      if (estado.falharTexto) throw new Error('Evolution fora do ar (teste)');
      return { idExterno: `T9${run}X${++seq}` };
    }),
    enviarPresenca: vi.fn(async (instancia: string, para: string, presenca: string, duracaoMs: number) => {
      chamadas.push({ tipo: 'presenca', em: Date.now(), instancia, para, presenca, duracaoMs });
    }),
  } as unknown as ChannelPort;

  const doContato = (e164: string, tipo?: Chamada['tipo']) =>
    chamadas.filter((c) => c.para === e164 && (!tipo || c.tipo === tipo));
  const daConversa = (conversationId: string) =>
    publicados.filter((p) => p.payload.conversationId === conversationId);

  async function novaConversa(opts: { revogado?: boolean } = {}) {
    const contato = await prisma.contact.create({ data: { e164: novoE164(), nome: `T9 ${run}` } });
    contatos.push(contato.id);
    if (opts.revogado) {
      await prisma.consent.create({ data: { contactId: contato.id, status: 'revogado', em: new Date() } });
    }
    const conversa = await prisma.conversation.create({ data: { contactId: contato.id, numeroId } });
    return { contato, conversa };
  }

  function bolhaIa(c: { id: string; versaoControle: number }, texto = 'Olá! Tudo bem?') {
    return prisma.message.create({
      data: { conversationId: c.id, numeroId, autor: 'ia', texto, status: 'pendente', versaoControle: c.versaoControle },
    });
  }

  async function esperarStatus(id: string, status: Message['status']): Promise<Message> {
    return esperarAte(async () => {
      const m = await prisma.message.findUniqueOrThrow({ where: { id } });
      return m.status === status ? m : null;
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    const numero = await prisma.whatsAppNumber.create({
      data: { rotulo: `T9 ${run}`, e164: novoE164(), instanciaEvolution: INSTANCIA, estado: 'conectado', ficticio: true },
    });
    numeroId = numero.id;
    const usuario = await prisma.user.create({
      data: { nome: `Ana T9${run}`, email: `ana.t9.${run}@teste.local`, papel: 'atendente', senhaHash: 'x' },
    });
    usuarioId = usuario.id;

    const config = { get: (k: string) => (k === 'DEMO_MODE' ? estado.demoMode : undefined) } as unknown as ConfigService;
    const settings = {
      iaGlobalAtiva: async () => estado.iaGlobal,
      numerosPermitidos: async () => estado.permitidos,
    } as unknown as SettingsService;
    const eventos = {
      publicar: vi.fn(async (tipo: string, payload: Record<string, unknown>) => {
        publicados.push({ tipo, payload, em: Date.now() });
      }),
    } as unknown as EventosService;
    const audit = { registrar: vi.fn(async () => undefined) } as unknown as AuditService;

    fila = new Queue(QUEUES.OUTBOUND, { connection: conexao, prefix });
    saida = new OutboundService(fila, prisma, eventos);
    processor = new OutboundProcessor(prisma, canal, settings, eventos, config);
    controle = new ControleService(prisma, audit, eventos, saida, canal, settings, config);
    worker = new Worker(
      QUEUES.OUTBOUND,
      async (job: Job<JobEnvio>) => {
        jobsProcessados.push(String(job.id));
        await processor.process(job);
      },
      { connection: conexao, prefix, ...OPCOES_WORKER_SAIDA },
    );
    await worker.waitUntilReady();
  });

  beforeEach(() => {
    estado.demoMode = false;
    estado.permitidos = [];
    estado.iaGlobal = true;
    estado.falharTexto = false;
  });

  afterAll(async () => {
    await worker?.close();
    processor?.onModuleDestroy();
    await fila?.obliterate({ force: true });
    await fila?.close();
    await prisma.message.deleteMany({ where: { numeroId } });
    await prisma.conversation.deleteMany({ where: { numeroId } });
    await prisma.contact.deleteMany({ where: { id: { in: contatos } } });
    await prisma.whatsAppNumber.delete({ where: { id: numeroId } });
    await prisma.user.delete({ where: { id: usuarioId } });
    await prisma.$disconnect();
  });

  it('envia presença composing, espera delayMs, revalida e envia; Message → enviada com idExterno', async () => {
    const { contato, conversa } = await novaConversa();
    const m = await bolhaIa(conversa);
    await saida.enfileirar(m.id, 300);

    const final = await esperarStatus(m.id, 'enviada');
    const ch = doContato(contato.e164);
    expect(ch.map((c) => c.tipo)).toEqual(['presenca', 'texto']);
    expect(ch[0]).toMatchObject({ instancia: INSTANCIA, presenca: 'composing', duracaoMs: 300 });
    expect(ch[1]).toMatchObject({ instancia: INSTANCIA, texto: 'Olá! Tudo bem?' });
    expect(ch[1].em - ch[0].em).toBeGreaterThanOrEqual(280); // esperou o "digitando" antes de enviar
    expect(final.idExterno).toMatch(new RegExp(`^T9${run}X`));
    expect(final.motivoFalha).toBeNull();
    expect(jobsProcessados).toContain(m.id);

    const ev = daConversa(conversa.id);
    expect(ev).toContainEqual(expect.objectContaining({ tipo: 'agent.typing', payload: { conversationId: conversa.id, ativo: true } }));
    expect(ev).toContainEqual(expect.objectContaining({ tipo: 'agent.typing', payload: { conversationId: conversa.id, ativo: false } }));
    expect(ev).toContainEqual(
      expect.objectContaining({ tipo: 'message.updated', payload: expect.objectContaining({ mensagemId: m.id, status: 'enviada' }) }),
    );
  });

  it('mensagem automática com conversa HUMANO no momento do envio → cancelada, canal não chamado', async () => {
    const { contato, conversa } = await novaConversa();
    const m = await bolhaIa(conversa);
    await saida.enfileirar(m.id, 400);

    // a IA já está "digitando"; a conversa muda de estado durante a espera
    await esperarAte(async () => doContato(contato.e164, 'presenca').length > 0);
    await prisma.conversation.update({ where: { id: conversa.id }, data: { estado: 'HUMANO' } });

    const final = await esperarStatus(m.id, 'cancelada');
    expect(final.motivoFalha).toBe(TEXTO_MOTIVO_ENVIO.estado_nao_ia_ativa);
    expect(doContato(contato.e164, 'texto')).toHaveLength(0);
    expect(canal.enviarTexto).not.toHaveBeenCalledWith(INSTANCIA, contato.e164, expect.anything(), expect.anything());
    expect(daConversa(conversa.id)).toContainEqual(
      expect.objectContaining({
        tipo: 'message.updated',
        payload: expect.objectContaining({ mensagemId: m.id, status: 'cancelada', motivoFalha: TEXTO_MOTIVO_ENVIO.estado_nao_ia_ativa }),
      }),
    );
  });

  it('versão mudou entre criação e envio → cancelada com motivo versao_mudou', async () => {
    const { contato, conversa } = await novaConversa();
    const m = await bolhaIa(conversa);
    await saida.enfileirar(m.id, 300);

    // estado continua IA_ATIVA; só a versão de controle muda enquanto a IA "digita"
    await esperarAte(async () => doContato(contato.e164, 'presenca').length > 0);
    await prisma.conversation.update({ where: { id: conversa.id }, data: { versaoControle: { increment: 1 } } });

    const final = await esperarStatus(m.id, 'cancelada');
    expect(final.motivoFalha).toBe(TEXTO_MOTIVO_ENVIO.versao_mudou);
    expect(doContato(contato.e164, 'texto')).toHaveLength(0);
  });

  it('IA global desligada → cancelada', async () => {
    estado.iaGlobal = false;
    const { contato, conversa } = await novaConversa();
    const m = await bolhaIa(conversa);
    await saida.enfileirar(m.id, 200);

    const final = await esperarStatus(m.id, 'cancelada');
    expect(final.motivoFalha).toBe(TEXTO_MOTIVO_ENVIO.ia_global_desligada);
    expect(doContato(contato.e164)).toHaveLength(0); // nem presença
  });

  it('demo: destino fora da lista → simulada (enviada, depois entregue e lida), canal não chamado', async () => {
    estado.demoMode = true;
    const permitido = await novaConversa();
    const fora = await novaConversa();
    estado.permitidos = [permitido.contato.e164];

    const m = await bolhaIa(fora.conversa, 'Simulada');
    await saida.enfileirar(m.id, 100);
    const enviada = await esperarStatus(m.id, 'enviada');
    expect(enviada.idExterno).toBeNull();
    await esperarStatus(m.id, 'entregue');
    await esperarStatus(m.id, 'lida');
    expect(doContato(fora.contato.e164)).toHaveLength(0);
    const status = daConversa(fora.conversa.id)
      .filter((p) => p.tipo === 'message.updated')
      .map((p) => p.payload.status);
    expect(status).toEqual(['enviada', 'entregue', 'lida']);

    // o número da lista sai de verdade
    const ok = await bolhaIa(permitido.conversa, 'Real');
    await saida.enfileirar(ok.id, 50);
    await esperarStatus(ok.id, 'enviada');
    expect(doContato(permitido.contato.e164, 'texto')).toHaveLength(1);
  });

  it('canal lança erro → falhou com motivo; reenvio usa o mesmo jobId', async () => {
    estado.falharTexto = true;
    const { contato, conversa } = await novaConversa();
    const m = await prisma.message.create({
      data: {
        conversationId: conversa.id,
        numeroId,
        autor: 'atendente',
        autorUsuarioId: usuarioId,
        texto: 'Mensagem manual',
        status: 'pendente',
      },
    });
    await saida.enfileirar(m.id, 0);

    const falhou = await esperarStatus(m.id, 'falhou');
    expect(falhou.motivoFalha).toContain('Evolution fora do ar (teste)');
    expect(doContato(contato.e164, 'texto')).toHaveLength(1); // tentou uma vez, sem retry automático

    // "Tentar de novo": volta a pendente e roda de novo com o mesmo jobId
    estado.falharTexto = false;
    await saida.reenviar(m.id);
    const enviada = await esperarStatus(m.id, 'enviada');
    expect(enviada.motivoFalha).toBeNull();
    expect(enviada.idExterno).toMatch(new RegExp(`^T9${run}X`));
    expect(jobsProcessados.filter((j) => j === m.id)).toHaveLength(2);
    expect(doContato(contato.e164, 'texto')).toHaveLength(2);

    // só falhou pode ser reenviada
    await expect(saida.reenviar(m.id)).rejects.toThrow();
  });

  it('humana para contato com interrupção sem confirmação → falhou restrito_sem_confirmacao', async () => {
    const { contato, conversa } = await novaConversa({ revogado: true });
    await prisma.conversation.update({ where: { id: conversa.id }, data: { estado: 'HUMANO', responsavelId: usuarioId } });
    const m = await prisma.message.create({
      data: {
        conversationId: conversa.id,
        numeroId,
        autor: 'atendente',
        autorUsuarioId: usuarioId,
        texto: 'Oi, aqui é a Ana',
        status: 'pendente',
      },
    });
    await saida.enfileirar(m.id, 0);

    const final = await esperarStatus(m.id, 'falhou');
    expect(final.motivoFalha).toBe(TEXTO_MOTIVO_ENVIO.restrito_sem_confirmacao);
    expect(doContato(contato.e164)).toHaveLength(0);
  });

  it('criarMensagemSistema: texto fixo com confirmadoRestrito sai mesmo fora de IA_ATIVA e com interrupção', async () => {
    const { contato, conversa } = await novaConversa({ revogado: true });
    await prisma.conversation.update({
      where: { id: conversa.id },
      data: { estado: 'AGUARDANDO_ESPECIALISTA', versaoControle: { increment: 3 } },
    });
    const id = await saida.criarMensagemSistema({
      conversationId: conversa.id,
      texto: 'Pronto, não vamos mais te enviar mensagens.',
      confirmadoRestrito: true,
    });

    const m = await esperarStatus(id, 'enviada');
    expect(m).toMatchObject({ autor: 'sistema', tipo: 'texto', confirmadoRestrito: true, versaoControle: null });
    expect(doContato(contato.e164).map((c) => c.tipo)).toEqual(['texto']); // digitando 0: sem presença
    expect(daConversa(conversa.id)).toContainEqual(
      expect.objectContaining({ tipo: 'message.created', payload: expect.objectContaining({ conversationId: conversa.id }) }),
    );
  });

  it('garantia de parada: assumir com a IA digitando e duas bolhas na fila → zero envios automáticos depois do clique', async () => {
    const { contato, conversa } = await novaConversa();
    const b1 = await bolhaIa(conversa, 'primeira bolha');
    const b2 = await bolhaIa(conversa, 'segunda bolha');
    await saida.enfileirar(b1.id, 1500);
    await saida.enfileirar(b2.id, 1500);

    // b1 está no meio do "digitando"
    await esperarAte(async () => doContato(contato.e164, 'presenca').length > 0);
    const clique = Date.now();
    await controle.assumir(conversa.id, usuarioId);

    // bolha atrasada de um turno que ainda rodava com a versão antiga
    const b3 = await bolhaIa(conversa, 'bolha atrasada');
    await saida.enfileirar(b3.id, 50);

    for (const b of [b1, b2, b3]) await esperarStatus(b.id, 'cancelada');
    // drena a fila: b1 termina a espera e a revalidação, b3 é processada
    await esperarAte(async () => {
      const n = await fila.getJobCounts('active', 'waiting', 'delayed', 'prioritized');
      return Object.values(n).every((v) => v === 0);
    });
    await new Promise((r) => setTimeout(r, 200));

    expect(doContato(contato.e164, 'texto')).toHaveLength(0);
    expect(chamadas.filter((c) => c.tipo === 'texto' && c.para === contato.e164 && c.em >= clique)).toHaveLength(0);
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversa.id } });
    expect(conv.estado).toBe('HUMANO');
    // o "digitando" foi desligado no painel e no WhatsApp, logo no clique (antes de b1 acordar)
    const typing = daConversa(conversa.id).filter((p) => p.tipo === 'agent.typing');
    expect(typing.at(-1)?.payload.ativo).toBe(false);
    expect(typing.find((p) => p.em >= clique && p.payload.ativo === false)!.em - clique).toBeLessThan(500);
    const pres = doContato(contato.e164, 'presenca');
    expect(pres[0].presenca).toBe('composing');
    expect(pres.slice(1).length).toBeGreaterThan(0);
    expect(pres.slice(1).every((c) => c.presenca === 'paused')).toBe(true);
    expect(pres[1].em - clique).toBeLessThan(500);
  });

  it('contingência (sistema com versão) é automática: versão velha → cancelada versao_mudou; versão atual sai', async () => {
    const { contato, conversa } = await novaConversa();
    await prisma.conversation.update({ where: { id: conversa.id }, data: { versaoControle: { increment: 1 } } });

    const velha = await saida.criarMensagemSistema({
      conversationId: conversa.id,
      texto: 'Já te respondo, só um instante.',
      versao: conversa.versaoControle,
    });
    const m = await esperarStatus(velha, 'cancelada');
    expect(m).toMatchObject({ autor: 'sistema', versaoControle: conversa.versaoControle, motivoFalha: TEXTO_MOTIVO_ENVIO.versao_mudou });
    expect(doContato(contato.e164)).toHaveLength(0);

    const atual = await saida.criarMensagemSistema({
      conversationId: conversa.id,
      texto: 'Já te respondo, só um instante.',
      versao: conversa.versaoControle + 1,
    });
    await esperarStatus(atual, 'enviada');
    expect(doContato(contato.e164, 'texto')).toHaveLength(1);
  });
});
