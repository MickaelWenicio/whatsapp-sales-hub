import { PrismaClient } from '@prisma/client';
import { ehNumeroFicticio, ETAPAS, filtrarBolha, lerTermosProibidos, podeMover, TEXTO_EMERGENCIA, TEXTO_INTERRUPCAO, type Etapa } from '@sales-hub/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apagarBaseDemo, gerarBaseDemo } from './gerador';

const prisma = new PrismaClient();
const AGORA = new Date('2026-11-11T12:00:00.000Z');
// Esta suíte APAGA e recria a base demo inteira (seed e ao_vivo). Nunca pode rodar no banco da
// apresentação: pula pelo nome na URL e, por garantia, confere no servidor antes de apagar.
const BANCO_PROTEGIDO = 'saleshub';
const bancoTeste = (() => {
  try {
    const nome = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
    return nome.length > 0 && nome !== BANCO_PROTEGIDO;
  } catch { return false; }
})();
let contagens: Awaited<ReturnType<typeof gerarBaseDemo>>;

async function nomes() {
  const r = await prisma.contact.findMany({ where: { origemDemo: 'seed' }, select: { nome: true, e164: true }, orderBy: { e164: 'asc' } });
  return r.map((c) => `${c.e164}|${c.nome}`);
}

describe.skipIf(!bancoTeste)('base fictícia determinística', () => {
  let nomes1: string[];
  beforeAll(async () => {
    const [{ banco }] = await prisma.$queryRaw<Array<{ banco: string }>>`SELECT current_database() AS banco`;
    if (banco === BANCO_PROTEGIDO) {
      throw new Error(`recusado: esta suíte apaga a base demo e não roda contra o banco "${BANCO_PROTEGIDO}"`);
    }
    await apagarBaseDemo(prisma);
    contagens = await gerarBaseDemo(prisma, { agora: AGORA });
    nomes1 = await nomes();
  }, 120_000);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('é determinística: duas execuções com a mesma semente geram os mesmos nomes e contagens', async () => {
    await apagarBaseDemo(prisma);
    const c2 = await gerarBaseDemo(prisma, { agora: AGORA });
    expect(c2).toEqual(contagens);
    expect(await nomes()).toEqual(nomes1);
    expect(contagens.contatos).toBe(180);
    expect(contagens.oportunidades).toBe(220);
    expect(contagens.conversas).toBeGreaterThanOrEqual(60);
  }, 120_000);

  it('todos os telefones são fictícios (+5500)', async () => {
    const cs = await prisma.contact.findMany({ where: { origemDemo: 'seed' }, select: { e164: true } });
    expect(cs.length).toBe(180);
    for (const c of cs) {
      expect(c.e164).toMatch(/^\+55009\d{8}$/);
      expect(ehNumeroFicticio(c.e164)).toBe(true);
    }
  });

  it('distribuição: venda_confirmada entre 30 e 40; perdido com "preço" como motivo mais frequente', async () => {
    const vendas = await prisma.opportunity.count({ where: { origemDemo: 'seed', etapa: 'venda_confirmada' } });
    expect(vendas).toBeGreaterThanOrEqual(30);
    expect(vendas).toBeLessThanOrEqual(40);
    const perdidas = await prisma.opportunity.findMany({ where: { origemDemo: 'seed', etapa: 'perdido' }, select: { motivoPerda: true } });
    const freq = new Map<string, number>();
    for (const p of perdidas) freq.set(p.motivoPerda ?? '', (freq.get(p.motivoPerda ?? '') ?? 0) + 1);
    const [topo] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]!;
    expect(topo).toMatch(/pre[çc]o/i);
    const ops = await prisma.opportunity.findMany({ where: { origemDemo: 'seed' }, select: { etapa: true } });
    const por = (e: Etapa) => ops.filter((o) => o.etapa === e).length;
    expect(por('novo_lead')).toBeGreaterThan(por('em_negociacao'));
    expect(por('novo_lead')).toBeGreaterThan(por('contratacao_em_andamento'));
  });

  it('toda Message ia tem AgentTurn; toda mudança de etapa tem OpportunityEvent', async () => {
    const ias = await prisma.message.findMany({ where: { autor: 'ia', conversation: { origemDemo: 'seed' } }, select: { agentTurnId: true, versaoControle: true, idExterno: true, status: true } });
    expect(ias.length).toBeGreaterThan(200);
    const turnos = new Set((await prisma.agentTurn.findMany({ where: { conversation: { origemDemo: 'seed' } }, select: { id: true } })).map((t) => t.id));
    for (const m of ias) {
      expect(m.agentTurnId).not.toBeNull();
      expect(turnos.has(m.agentTurnId!)).toBe(true);
      expect(m.versaoControle).not.toBeNull();
      expect(m.idExterno).toMatch(/^seed\.\d+$/);
      expect(['entregue', 'lida']).toContain(m.status);
    }
    const ops = await prisma.opportunity.findMany({ where: { origemDemo: 'seed' }, include: { eventos: { orderBy: { criadoEm: 'asc' } } } });
    for (const o of ops) {
      expect(o.eventos.length).toBeGreaterThan(0);
      expect(o.eventos[0]!.de).toBeNull();
      expect(o.eventos[0]!.para).toBe('novo_lead');
      expect(o.eventos[o.eventos.length - 1]!.para).toBe(o.etapa);
      expect(o.etapaDesde.getTime()).toBe(o.eventos[o.eventos.length - 1]!.criadoEm.getTime());
      for (let i = 1; i < o.eventos.length; i++) {
        const e = o.eventos[i]!;
        expect(e.de).toBe(o.eventos[i - 1]!.para);
        expect(podeMover(e.de as Etapa, e.para as Etapa, e.ator).ok).toBe(true);
        expect(e.criadoEm.getTime()).toBeGreaterThan(o.eventos[i - 1]!.criadoEm.getTime());
      }
      expect(ETAPAS).toContain(o.etapa);
      expect(o.criadaEm.getTime()).toBeGreaterThanOrEqual(AGORA.getTime() - 90 * 86_400_000);
      expect(o.eventos[o.eventos.length - 1]!.criadoEm.getTime()).toBeLessThanOrEqual(AGORA.getTime());
    }
  });

  it('toda oportunidade aponta para um item de interesse do próprio contato e para um produto do catálogo', async () => {
    const itens = await prisma.interestItem.findMany({ where: { contact: { origemDemo: 'seed' } }, select: { id: true, contactId: true, categoria: true, descricao: true } });
    expect(itens.length).toBe(220);
    for (const i of itens) {
      expect(i.categoria).toBeTruthy();
      expect(i.descricao).toBeTruthy();
    }
    const donoDoItem = new Map(itens.map((i) => [i.id, i.contactId]));
    const ops = await prisma.opportunity.findMany({ where: { origemDemo: 'seed' }, select: { contactId: true, itemId: true, produto: true } });
    for (const o of ops) {
      expect(o.itemId).not.toBeNull();
      expect(donoDoItem.get(o.itemId!)).toBe(o.contactId);
      expect(['plano-essencial', 'plano-completo', 'solucoes-empresas']).toContain(o.produto);
    }
  });

  it('há ≥ 3 oportunidades em contratacao_em_andamento e exatamente 1 conversa com prioridade emergencia', async () => {
    expect(await prisma.opportunity.count({ where: { origemDemo: 'seed', etapa: 'contratacao_em_andamento' } })).toBeGreaterThanOrEqual(3);
    const em = await prisma.conversation.findMany({ where: { origemDemo: 'seed', prioridade: 'emergencia' } });
    expect(em.length).toBe(1);
    const textos = await prisma.message.findMany({ where: { conversationId: em[0]!.id, autor: 'sistema' } });
    expect(textos.map((m) => m.texto)).toContain(TEXTO_EMERGENCIA);
  });

  it('textos da IA e da equipe passam no filtro de saída (só o preço aprovado) e há interrupção com texto fixo', async () => {
    const ms = await prisma.message.findMany({ where: { autor: { in: ['ia', 'sistema', 'atendente'] }, conversation: { origemDemo: 'seed' } }, select: { texto: true } });
    const termos = lerTermosProibidos(process.env.AGENT_TERMOS_PROIBIDOS);
    for (const m of ms) {
      expect(filtrarBolha(m.texto ?? '', [6990], termos)).toEqual({ ok: true });
      for (const preco of (m.texto ?? '').match(/R\$\s?[\d.,]+/g) ?? []) expect(preco).toBe('R$ 69,90');
    }
    expect(ms.some((m) => m.texto === TEXTO_INTERRUPCAO)).toBe(true);
  });

  it('estados variados, tarefas abertas e vencidas, trilha com ferramentas válidas', async () => {
    const estados = await prisma.conversation.groupBy({ by: ['estado'], where: { origemDemo: 'seed' }, _count: true });
    expect(estados.map((e) => e.estado).sort()).toEqual(['AGUARDANDO_ESPECIALISTA', 'ENCERRADA', 'HUMANO', 'IA_ATIVA', 'IA_PAUSADA']);
    const abertas = await prisma.task.count({ where: { origemDemo: 'seed', status: 'aberta' } });
    const vencidas = await prisma.task.count({ where: { origemDemo: 'seed', status: 'aberta', prazoEm: { lt: AGORA } } });
    expect(abertas).toBeGreaterThan(10);
    expect(vencidas).toBeGreaterThan(3);
    const acoes = await prisma.agentAction.findMany({ where: { conversation: { origemDemo: 'seed' } }, select: { ferramenta: true, status: true, justificativa: true } });
    const validas = ['responder', 'atualizar_contato', 'registrar_item', 'registrar_interesse', 'mover_etapa', 'registrar_objecao', 'solicitar_cotacao', 'sinalizar_intencao', 'transferir_para_humano', 'sinalizar_emergencia', 'registrar_interrupcao'];
    for (const a of acoes) {
      expect(validas).toContain(a.ferramenta);
      expect(a.status).toBe('aplicada');
      expect(a.justificativa).toBeTruthy();
    }
    expect(await prisma.conversationSummary.count({ where: { conversation: { origemDemo: 'seed' } } })).toBeGreaterThanOrEqual(60);
  });

  it('IA só autora mudança de etapa com AgentAction mover_etapa; atendentes são usuários reais; naoLidas confere', async () => {
    const evs = await prisma.opportunityEvent.findMany({ where: { ator: 'ia', opportunity: { origemDemo: 'seed' } }, include: { opportunity: true } });
    expect(evs.length).toBeGreaterThan(0);
    for (const e of evs) {
      expect(e.mensagemOrigemId).not.toBeNull();
      const conv = await prisma.conversation.findFirst({ where: { contactId: e.opportunity.contactId, origemDemo: 'seed' }, select: { id: true } });
      const acoes = await prisma.agentAction.findMany({ where: { conversationId: conv!.id, ferramenta: 'mover_etapa' } });
      expect(acoes.some((a) => (a.entrada as { para?: string }).para === e.para)).toBe(true);
    }
    const ats = await prisma.message.findMany({ where: { autor: 'atendente', conversation: { origemDemo: 'seed' } }, select: { autorUsuarioId: true, texto: true, conversation: { select: { estado: true, responsavelId: true } } } });
    expect(ats.length).toBeGreaterThan(10);
    for (const m of ats) {
      expect(m.autorUsuarioId).not.toBeNull();
      if (m.conversation.estado === 'HUMANO') expect(m.autorUsuarioId).toBe(m.conversation.responsavelId);
    }
    const convs = await prisma.conversation.findMany({ where: { origemDemo: 'seed' }, include: { mensagens: { orderBy: { criadaEm: 'asc' } } } });
    for (const c of convs) {
      const ms = c.mensagens;
      expect(c.ultimaMensagemEm?.getTime()).toBe(ms[ms.length - 1]!.criadaEm.getTime());
      const cli = ms.filter((m) => m.autor === 'cliente');
      expect(c.ultimaMensagemClienteEm?.getTime()).toBe(cli[cli.length - 1]?.criadaEm.getTime());
      if (c.estado === 'ENCERRADA') continue;
      let n = 0;
      for (let k = ms.length - 1; k >= 0; k--) {
        const m = ms[k]!;
        if (m.autor === 'cliente') n++;
        else if (m.tipo !== 'evento' && m.tipo !== 'nota_interna') break;
      }
      expect(c.naoLidas).toBe(n);
    }
  });
});
