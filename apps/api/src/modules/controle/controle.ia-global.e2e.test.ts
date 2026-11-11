import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '../../queue/queue.constants';
import { parseRedisUrl } from '../../queue/redis-connection';
import { OutboundService } from '../outbound/outbound.service';
import type { EventosService } from '../realtime/eventos.service';
import type { AuditService, EntradaAuditoria } from '../security/audit.service';
import { ControleService } from './controle.service';

/**
 * O interruptor geral mexe em linhas que este teste NÃO é dono: o setting global `iaGlobalAtiva`
 * e a `versaoControle` de TODAS as conversas abertas do banco. Por isso só roda num banco dedicado
 * de teste: nunca contra `saleshub` (banco principal e da demonstração). O setting (valor e
 * `atualizadoPor`) é restaurado no fim.
 */
const BANCO_PROTEGIDO = 'saleshub';
const bancoDaUrl = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? '').pathname.replace(/^\//, '');
  } catch {
    return '';
  }
})();

const run = randomUUID().replace(/-/g, '').slice(0, 10);
const novoE164 = () => `+5500${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

describe.skipIf(!bancoDaUrl || bancoDaUrl === BANCO_PROTEGIDO)('ControleService.definirIaGlobal (banco dedicado)', () => {
  const prisma = new PrismaService();
  const conexao = parseRedisUrl(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const prefix = `t9g-${run}`;
  const auditorias: EntradaAuditoria[] = [];
  const publicados: Array<{ tipo: string; payload: Record<string, unknown> }> = [];
  const contatos: string[] = [];
  let guardaOk = false; // só limpa/restaura se a guarda passou
  let original: { valor: Prisma.JsonValue; atualizadoPor: string | null } | null = null;
  let numeroId: string;
  let gestorId: string;
  let fila: Queue;
  let saida: OutboundService;
  let controle: ControleService;

  async function novaConversa() {
    const contato = await prisma.contact.create({ data: { e164: novoE164(), nome: `T9G ${run}` } });
    contatos.push(contato.id);
    return prisma.conversation.create({ data: { contactId: contato.id, numeroId } });
  }
  const versao = async (id: string) => (await prisma.conversation.findUniqueOrThrow({ where: { id } })).versaoControle;
  const setting = () => prisma.systemSetting.findUniqueOrThrow({ where: { chave: 'iaGlobalAtiva' } });

  beforeAll(async () => {
    await prisma.$connect();
    // guarda dura: confere no próprio servidor, não só na URL
    const [{ banco }] = await prisma.$queryRaw<Array<{ banco: string }>>`SELECT current_database() AS banco`;
    if (banco === BANCO_PROTEGIDO) {
      throw new Error(`recusado: este teste altera linhas globais e não roda contra o banco "${BANCO_PROTEGIDO}"`);
    }
    guardaOk = true;

    const s = await prisma.systemSetting.findUnique({ where: { chave: 'iaGlobalAtiva' } });
    original = s ? { valor: s.valor, atualizadoPor: s.atualizadoPor } : null;
    const numero = await prisma.whatsAppNumber.create({
      data: { rotulo: `T9G ${run}`, e164: novoE164(), instanciaEvolution: `t9g-${run}`, estado: 'conectado', ficticio: true },
    });
    numeroId = numero.id;
    gestorId = (
      await prisma.user.create({
        data: { nome: `Gestor T9${run}`, email: `gestor.t9g.${run}@teste.local`, papel: 'gestor', senhaHash: 'x' },
      })
    ).id;

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
    fila = new Queue(QUEUES.OUTBOUND, { connection: conexao, prefix });
    saida = new OutboundService(fila, prisma, eventos);
    controle = new ControleService(prisma, audit, eventos, saida);

    // ponto de partida conhecido: ligada
    await prisma.systemSetting.upsert({
      where: { chave: 'iaGlobalAtiva' },
      create: { chave: 'iaGlobalAtiva', valor: true },
      update: { valor: true },
    });
  });

  beforeEach(() => {
    auditorias.length = 0;
    publicados.length = 0;
  });

  afterAll(async () => {
    if (guardaOk) {
      if (original === null) {
        await prisma.systemSetting.deleteMany({ where: { chave: 'iaGlobalAtiva' } });
      } else {
        await prisma.systemSetting.update({
          where: { chave: 'iaGlobalAtiva' },
          data: { valor: original.valor as Prisma.InputJsonValue, atualizadoPor: original.atualizadoPor },
        });
      }
      await fila?.obliterate({ force: true });
      await fila?.close();
      await prisma.message.deleteMany({ where: { numeroId } });
      await prisma.conversation.deleteMany({ where: { numeroId } });
      await prisma.contact.deleteMany({ where: { id: { in: contatos } } });
      if (numeroId) await prisma.whatsAppNumber.delete({ where: { id: numeroId } });
      if (gestorId) await prisma.user.delete({ where: { id: gestorId } });
    }
    await prisma.$disconnect();
  });

  it('definirIaGlobal(false): setting false, versão +1 em todas as conversas abertas, auditoria com ator', async () => {
    const a = await novaConversa();
    const b = await novaConversa();
    const fechada = await novaConversa();
    await prisma.conversation.update({ where: { id: fechada.id }, data: { estado: 'ENCERRADA' } });
    const pendente = await prisma.message.create({
      data: { conversationId: a.id, numeroId, autor: 'ia', texto: 'bolha', status: 'pendente', versaoControle: a.versaoControle },
    });
    await saida.enfileirar(pendente.id, 2000);
    const contingencia = await saida.criarMensagemSistema({ conversationId: b.id, texto: 'Já te respondo', versao: b.versaoControle });

    await controle.definirIaGlobal(false, gestorId);

    const s = await setting();
    expect(s.valor).toBe(false);
    expect(s.atualizadoPor).toBe(gestorId);
    expect(await versao(a.id)).toBe(a.versaoControle + 1);
    expect(await versao(b.id)).toBe(b.versaoControle + 1);
    expect(await versao(fechada.id)).toBe(fechada.versaoControle);
    expect(auditorias).toContainEqual(
      expect.objectContaining({ ator: `usuario_painel:${gestorId}`, acao: 'ia_global.desligar', entidadeId: 'iaGlobalAtiva' }),
    );
    expect(publicados).toContainEqual({ tipo: 'settings.updated', payload: { chave: 'iaGlobalAtiva' } });
    for (const id of [pendente.id, contingencia]) {
      const m = await prisma.message.findUniqueOrThrow({ where: { id } });
      expect(m).toMatchObject({ status: 'cancelada', motivoFalha: 'IA desligada no interruptor geral' });
      expect(await fila.getJob(id)).toBeUndefined();
    }
  });

  it('definirIaGlobal com o mesmo valor: sem versão +1, sem auditoria, sem evento', async () => {
    const a = await novaConversa();
    expect((await setting()).valor).toBe(false); // ficou desligada no teste anterior

    await controle.definirIaGlobal(false, gestorId);
    expect(await versao(a.id)).toBe(a.versaoControle);
    expect(auditorias).toHaveLength(0);
    expect(publicados).toHaveLength(0);

    await controle.definirIaGlobal(true, gestorId); // mudança real
    expect(await versao(a.id)).toBe(a.versaoControle + 1);
    expect((await setting()).valor).toBe(true);
    expect(auditorias).toContainEqual(expect.objectContaining({ acao: 'ia_global.ligar' }));

    auditorias.length = 0;
    publicados.length = 0;
    await controle.definirIaGlobal(true, gestorId); // repetido
    expect(await versao(a.id)).toBe(a.versaoControle + 1);
    expect(auditorias).toHaveLength(0);
    expect(publicados).toHaveLength(0);
  });
});
