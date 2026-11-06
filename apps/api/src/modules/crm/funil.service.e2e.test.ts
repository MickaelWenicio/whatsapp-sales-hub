import { randomUUID } from 'node:crypto';
import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import type { EventosService } from '../realtime/eventos.service';
import { FunilService } from './funil.service';

const run = randomUUID().replace(/-/g, '').slice(0, 10);
const rnd = () => `+5500${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
const contatos: string[] = [];

describe('FunilService (Postgres local)', () => {
  const prisma = new PrismaService();
  const publicar = vi.fn(async (..._a: unknown[]) => undefined);
  let svc: FunilService;
  let usuarioId: string;

  beforeAll(async () => {
    await prisma.$connect();
    svc = new FunilService(prisma, { publicar } as unknown as EventosService);
    const u = await prisma.user.create({
      data: { nome: `T10a ${run}`, email: `t10a-${run}@teste.local`, papel: 'atendente', senhaHash: 'x' },
    });
    usuarioId = u.id;
  });

  afterAll(async () => {
    await prisma.contact.deleteMany({ where: { e164: { in: contatos } } });
    await prisma.user.delete({ where: { id: usuarioId } });
    await prisma.$disconnect();
  });

  async function novaOp(etapa: 'em_negociacao' | 'em_atendimento') {
    const e164 = rnd();
    contatos.push(e164);
    const c = await prisma.contact.create({ data: { e164, nome: 'Cliente T10a' } });
    return prisma.opportunity.create({ data: { contactId: c.id, etapa } });
  }

  it('venda_confirmada exige evidência; cria Task pos_venda e Contact cliente_ativo', async () => {
    const op = await novaOp('em_negociacao');
    await expect(
      svc.mover({ opportunityId: op.id, para: 'venda_confirmada', ator: 'humano', atorUsuarioId: usuarioId }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: op.id } })).etapa).toBe('em_negociacao');

    publicar.mockClear();
    const card = await svc.mover({
      opportunityId: op.id,
      para: 'venda_confirmada',
      ator: 'humano',
      atorUsuarioId: usuarioId,
      evidencia: { tipo: 'contrato_assinado', observacao: 'Contrato 123 assinado' },
    });
    expect(card.etapa).toBe('venda_confirmada');
    const salvo = await prisma.opportunity.findUniqueOrThrow({ where: { id: op.id } });
    expect(salvo.fechadaEm).not.toBeNull();
    const tarefas = await prisma.task.findMany({ where: { opportunityId: op.id } });
    expect(tarefas.map((t) => t.tipo)).toEqual(['pos_venda']);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: op.contactId } })).statusCliente).toBe('cliente_ativo');
    const ev = await prisma.opportunityEvent.findMany({ where: { opportunityId: op.id } });
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ de: 'em_negociacao', para: 'venda_confirmada', ator: 'humano', atorUsuarioId: usuarioId });
    expect(publicar).toHaveBeenCalledWith('opportunity.updated', { oportunidade: card });
  });

  it('perdido exige motivoPerda', async () => {
    const op = await novaOp('em_atendimento');
    await expect(svc.mover({ opportunityId: op.id, para: 'perdido', ator: 'humano', atorUsuarioId: usuarioId })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const card = await svc.mover({ opportunityId: op.id, para: 'perdido', ator: 'ia', motivoPerda: 'Achou caro', justificativa: 'Cliente desistiu' });
    expect(card.etapa).toBe('perdido');
    const salvo = await prisma.opportunity.findUniqueOrThrow({ where: { id: op.id } });
    expect(salvo.motivoPerda).toBe('Achou caro');
    expect(salvo.fechadaEm).not.toBeNull();
  });

  it('IA não move para venda_confirmada', async () => {
    const op = await novaOp('em_negociacao');
    await expect(
      svc.mover({
        opportunityId: op.id,
        para: 'venda_confirmada',
        ator: 'ia',
        evidencia: { tipo: 'contrato_assinado', observacao: 'x' },
      }),
    ).rejects.toThrow('A IA não pode confirmar vendas. Uma pessoa precisa confirmar com evidência.');
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: op.id } })).etapa).toBe('em_negociacao');
    expect(await prisma.opportunityEvent.count({ where: { opportunityId: op.id } })).toBe(0);
  });
});
