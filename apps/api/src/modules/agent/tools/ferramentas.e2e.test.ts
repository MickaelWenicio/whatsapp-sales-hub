import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../prisma/prisma.service';
import { LlmFalso, fim, montarAgente } from '../testing/ambiente';
import { FixturesAgente } from '../testing/fixtures';
import type { ContextoTurno } from './contexto';

/** Ferramentas chamadas pelo Dispatcher, com Postgres real e dublês de borda. */
const J = 'Justificativa de teste.';

describe('ferramentas (Dispatcher)', () => {
  const prisma = new PrismaService();
  const fx = new FixturesAgente(prisma);
  const amb = () => montarAgente(prisma, { llm: new LlmFalso([fim()]) });

  async function contexto(textoCliente = 'oi'): Promise<ContextoTurno> {
    const { conversa, mensagem } = await fx.conversa(textoCliente);
    const turno = await prisma.agentTurn.create({
      data: { conversationId: conversa.id, iniciadoEm: new Date(), modelo: 'claude-opus-5-5', versaoControle: 0 },
    });
    return {
      conversationId: conversa.id,
      contactId: conversa.contactId,
      mensagemOrigemId: mensagem!.id,
      agentTurnId: turno.id,
      versao: 0,
      bolhasIds: [],
      bloqueios: 0,
    };
  }

  beforeAll(async () => {
    await prisma.$connect();
    await fx.preparar();
  });

  afterAll(async () => {
    await fx.limpar();
    await prisma.$disconnect();
  });

  it('atualizar_contato grava os campos e marca camposIa com a mensagem de origem', async () => {
    const { dispatcher } = amb();
    const ctx = await contexto();
    const r = await dispatcher.executar(ctx, 'atualizar_contato', {
      nome: 'Marina',
      cidade: 'Campinas',
      uf: 'sp',
      melhorHorario: 'à tarde',
      justificativa: J,
    });
    expect(r.ok).toBe(true);
    const c = await prisma.contact.findUniqueOrThrow({ where: { id: ctx.contactId } });
    expect(c).toMatchObject({ nome: 'Marina', cidade: 'Campinas', uf: 'SP' });
    const campos = c.camposIa as Record<string, { mensagemId: string; valor?: string }>;
    expect(Object.keys(campos).sort()).toEqual(['cidade', 'melhorHorario', 'nome', 'uf']);
    expect(campos.nome!.mensagemId).toBe(ctx.mensagemOrigemId);
    expect(campos.melhorHorario!.valor).toBe('à tarde');
  });

  it('entrada inválida volta como erro sem gravar', async () => {
    const { dispatcher } = amb();
    const ctx = await contexto();
    const r = await dispatcher.executar(ctx, 'registrar_item', { quantidade: 0, justificativa: J });
    expect(r.ok).toBe(false);
    expect(await prisma.interestItem.count({ where: { contactId: ctx.contactId } })).toBe(0);
    // produto fora do catálogo também volta como erro, sem criar oportunidade
    const p = await dispatcher.executar(ctx, 'registrar_interesse', { produto: 'produto-inexistente', justificativa: J });
    expect(p.ok).toBe(false);
    expect(p.erro).toMatch(/não está no catálogo/);
    expect(await prisma.opportunity.count({ where: { contactId: ctx.contactId } })).toBe(0);
    const d = await dispatcher.executar(ctx, 'ferramenta_que_nao_existe', {});
    expect(d.ok).toBe(false);
  });

  it('registrar_item completa o item existente (sem duplicar) e o liga à oportunidade aberta', async () => {
    const { dispatcher } = amb();
    const ctx = await contexto();
    await dispatcher.executar(ctx, 'registrar_interesse', { produto: 'plano-completo', justificativa: J });
    await dispatcher.executar(ctx, 'registrar_item', { categoria: 'Empresa pequena', justificativa: J });
    await dispatcher.executar(ctx, 'registrar_item', { categoria: 'empresa pequena', descricao: 'equipe de 15 pessoas', quantidade: 15, justificativa: J });
    const its = await prisma.interestItem.findMany({ where: { contactId: ctx.contactId } });
    expect(its).toHaveLength(1);
    expect(its[0]).toMatchObject({ descricao: 'equipe de 15 pessoas', quantidade: 15 });
    expect(Object.keys(its[0]!.camposIa as object).sort()).toEqual(['categoria', 'descricao', 'quantidade']);
    const op = await prisma.opportunity.findFirstOrThrow({ where: { contactId: ctx.contactId } });
    expect(op).toMatchObject({ itemId: its[0]!.id, produto: 'plano-completo', etapa: 'em_atendimento' });
  });

  it('solicitar_cotacao: Task cotacao para o primeiro atendente ativo, prazo +2 h, etapa aguardando_cotacao, sem duplicar', async () => {
    const { dispatcher, publicados } = amb();
    const ctx = await contexto();
    expect((await dispatcher.executar(ctx, 'solicitar_cotacao', { justificativa: J })).ok).toBe(false); // sem oportunidade
    await dispatcher.executar(ctx, 'registrar_item', { categoria: 'Empresa pequena', descricao: 'equipe de 15 pessoas', justificativa: J });
    await dispatcher.executar(ctx, 'registrar_interesse', { produto: 'solucoes-empresas', preocupacao: 'suporte', justificativa: J });
    const antes = Date.now();
    const r = await dispatcher.executar(ctx, 'solicitar_cotacao', { observacoes: '15 pessoas, quer implantação rápida', justificativa: J });
    expect(r.ok).toBe(true);
    await dispatcher.executar(ctx, 'solicitar_cotacao', { justificativa: J });

    const atendente = await prisma.user.findFirstOrThrow({ where: { papel: 'atendente', ativo: true }, orderBy: { createdAt: 'asc' } });
    const tarefas = await prisma.task.findMany({ where: { conversationId: ctx.conversationId } });
    expect(tarefas).toHaveLength(1);
    expect(tarefas[0]).toMatchObject({ tipo: 'cotacao', status: 'aberta', responsavelId: atendente.id });
    expect(tarefas[0]!.titulo).toContain('(Empresa pequena, equipe de 15 pessoas)');
    const prazo = tarefas[0]!.prazoEm!.getTime() - antes;
    expect(prazo).toBeGreaterThan(2 * 3600_000 - 60_000);
    expect(prazo).toBeLessThan(2 * 3600_000 + 60_000);
    const op = await prisma.opportunity.findFirstOrThrow({ where: { contactId: ctx.contactId } });
    expect(op).toMatchObject({ etapa: 'aguardando_cotacao', responsavelId: atendente.id });
    expect(publicados.some((p) => p.tipo === 'task.updated' && p.payload.taskId === tarefas[0]!.id)).toBe(true);
    expect(publicados.some((p) => p.tipo === 'opportunity.updated')).toBe(true);
    const nota = await prisma.message.findFirst({ where: { conversationId: ctx.conversationId, tipo: 'nota_interna' } });
    expect(nota?.texto).toContain('15 pessoas, quer implantação rápida');
  });

  it('registrar_objecao e sinalizar_intencao: objeção na oportunidade, prioridade alta, tarefa e contratação em andamento', async () => {
    const { dispatcher } = amb();
    const ctx = await contexto();
    await dispatcher.executar(ctx, 'registrar_interesse', { produto: 'plano-essencial', justificativa: J });
    const o = await dispatcher.executar(ctx, 'registrar_objecao', { tipo: 'preco', descricao: 'Achou caro', justificativa: J });
    expect(o.ok).toBe(true);
    const i = await dispatcher.executar(ctx, 'sinalizar_intencao', { sinais: 'Pediu o contrato', justificativa: J });
    expect(i.ok).toBe(true);
    const op = await prisma.opportunity.findFirstOrThrow({ where: { contactId: ctx.contactId }, include: { objecoes: true } });
    expect(op.objecoes.map((x) => x.tipo)).toEqual(['preco']);
    expect(op).toMatchObject({ etapa: 'contratacao_em_andamento', prioridade: 'alta' });
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: ctx.conversationId } });
    expect(conv.prioridade).toBe('alta');
    expect(await prisma.task.count({ where: { opportunityId: op.id, tipo: 'encaminhar_contratacao' } })).toBe(1);
  });

  it('responder: até 4 bolhas por turno; a 5ª volta como erro', async () => {
    const { dispatcher } = amb();
    const ctx = await contexto();
    const r1 = await dispatcher.executar(ctx, 'responder', { mensagens: ['um', 'dois', 'três'], justificativa: J });
    expect(r1.ok).toBe(true);
    const r2 = await dispatcher.executar(ctx, 'responder', { mensagens: ['quatro', 'cinco'], justificativa: J });
    expect(r2.ok).toBe(false);
    expect(r2.bloqueio).toBeFalsy();
    expect(await prisma.message.count({ where: { conversationId: ctx.conversationId, autor: 'ia' } })).toBe(3);
  });

  it('registrar_interrupcao: numa transação revoga o consentimento e incrementa a versão; cancela pendentes; texto fixo restrito', async () => {
    const { dispatcher } = amb();
    const ctx = await contexto('parem de me mandar mensagem');
    const pendente = await fx.mensagem(ctx.conversationId, { autor: 'ia', texto: 'Oi!', status: 'pendente', versaoControle: 0 });
    const r = await dispatcher.executar(ctx, 'registrar_interrupcao', { justificativa: J });
    expect(r).toMatchObject({ ok: true, terminal: true });
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: ctx.conversationId } })).versaoControle).toBe(1);
    expect((await prisma.consent.findUniqueOrThrow({ where: { contactId: ctx.contactId } })).status).toBe('revogado');
    expect((await prisma.message.findUniqueOrThrow({ where: { id: pendente.id } })).status).toBe('cancelada');
  });
});
