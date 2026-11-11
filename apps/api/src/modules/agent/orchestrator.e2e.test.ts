import { TEXTO_CONTINGENCIA, TEXTO_EMERGENCIA, TEXTO_INTERRUPCAO } from '@sales-hub/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service';
import { SETOR_EMERGENCIA } from '../../common/mapeadores';
import {
  LlmFalso,
  ferramenta,
  fim,
  montarAgente,
  resposta,
  texto,
  usoTokens,
} from './testing/ambiente';
import { FixturesAgente } from './testing/fixtures';

/**
 * Orquestrador com LLM falso (BetaMessage roteirizadas), Postgres real (.env) e serviços reais
 * de saída, controle e funil. Filas e eventos são dublês. Só linhas desta execução são apagadas.
 */
const J = 'Justificativa de teste.';
const SEM_SINAIS = { emergencia: false, interrupcao: false };

describe('Orquestrador (LLM falso)', () => {
  const prisma = new PrismaService();
  const fx = new FixturesAgente(prisma);

  beforeAll(async () => {
    await prisma.$connect();
    await fx.preparar();
  });

  afterAll(async () => {
    await fx.limpar();
    await prisma.$disconnect();
  });

  const mensagensDa = (conversationId: string) =>
    prisma.message.findMany({ where: { conversationId }, orderBy: { criadaEm: 'asc' } });
  const acoesDa = (conversationId: string) =>
    prisma.agentAction.findMany({ where: { conversationId }, orderBy: { criadoEm: 'asc' } });

  it('turno de qualificação: registrar_item + registrar_interesse + responder → InterestItem, Opportunity em_atendimento, 2 Message ia pendentes, AgentActions aplicadas com justificativa', async () => {
    const { conversa, mensagem } = await fx.conversa('Oi, quanto custa o plano completo pra minha empresa? Somos 15 pessoas');
    const llm = new LlmFalso([
      resposta([
        ferramenta('registrar_item', { categoria: 'Empresa pequena', descricao: 'equipe de 15 pessoas', quantidade: 15, justificativa: 'Cliente informou o tamanho da equipe.' }),
        ferramenta('registrar_interesse', { produto: 'plano-completo', justificativa: 'Perguntou pelo Plano Completo.' }),
        ferramenta('responder', {
          mensagens: ['Oi! Que bom falar com você.', 'O Plano Completo é sob cotação. Em qual cidade fica a sua empresa?'],
          justificativa: 'Responde a dúvida e pede a cidade.',
        }),
      ]),
      fim(),
    ]);
    const { orquestrador, publicados } = montarAgente(prisma, { llm });

    const r = await orquestrador.processar(conversa.id, SEM_SINAIS);

    expect(r).toBe('ok');
    expect(llm.chamadas).toBe(2);
    // os 3 tool_result voltam numa única mensagem user
    const segunda = llm.entradas[1]!.messages;
    const ultima = segunda.at(-1)!;
    expect(ultima.role).toBe('user');
    expect((ultima.content as Array<{ type: string; is_error?: boolean }>).map((b) => b.type)).toEqual([
      'tool_result',
      'tool_result',
      'tool_result',
    ]);
    expect((ultima.content as Array<{ is_error?: boolean }>).every((b) => !b.is_error)).toBe(true);

    const itens = await prisma.interestItem.findMany({ where: { contactId: conversa.contactId } });
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ categoria: 'Empresa pequena', descricao: 'equipe de 15 pessoas', quantidade: 15 });
    expect((itens[0]!.camposIa as Record<string, { mensagemId: string }>).descricao?.mensagemId).toBe(mensagem!.id);

    const ops = await prisma.opportunity.findMany({ where: { contactId: conversa.contactId }, include: { eventos: true } });
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ etapa: 'em_atendimento', produto: 'plano-completo', itemId: itens[0]!.id });
    expect(ops[0]!.eventos.map((e) => `${e.para}:${e.ator}`).sort()).toEqual(['em_atendimento:ia', 'novo_lead:sistema']);

    const ia = (await mensagensDa(conversa.id)).filter((m) => m.autor === 'ia');
    expect(ia).toHaveLength(2);
    expect(ia.every((m) => m.status === 'pendente' && m.versaoControle === 0 && m.agentTurnId)).toBe(true);

    const acoes = await acoesDa(conversa.id);
    expect(acoes.map((a) => a.ferramenta)).toEqual(['registrar_item', 'registrar_interesse', 'responder']);
    expect(acoes.every((a) => a.status === 'aplicada' && a.justificativa && a.mensagemOrigemId === mensagem!.id)).toBe(true);
    // trilha ao vivo + digitando liga/desliga
    expect(publicados.filter((p) => p.tipo === 'agent.action')).toHaveLength(3);
    const digitando = publicados.filter((p) => p.tipo === 'agent.typing').map((p) => p.payload.ativo);
    expect(digitando[0]).toBe(true);
    expect(digitando.at(-1)).toBe(false);
  });

  it('texto fora de responder é ignorado e registrado; nenhuma Message criada a partir dele', async () => {
    const { conversa } = await fx.conversa('oi');
    const llm = new LlmFalso([resposta([texto('Olá! Como posso ajudar?')], 'end_turn')]);
    const { orquestrador } = montarAgente(prisma, { llm });

    const r = await orquestrador.processar(conversa.id, SEM_SINAIS);

    expect(r).toBe('ok');
    expect((await mensagensDa(conversa.id)).filter((m) => m.autor !== 'cliente')).toHaveLength(0);
    const acoes = await acoesDa(conversa.id);
    expect(acoes).toHaveLength(1);
    expect(acoes[0]).toMatchObject({ status: 'descartada', entrada: { texto: 'Olá! Como posso ajudar?' } });
  });

  it('bolha com "R$ 129,90" volta como is_error; o modelo reescreve; só a reescrita é enfileirada', async () => {
    const { conversa } = await fx.conversa('quanto custa o plano completo?');
    const llm = new LlmFalso([
      resposta([ferramenta('responder', { mensagens: ['O Plano Completo sai por R$ 129,90 por mês.'], justificativa: J })]),
      resposta([
        ferramenta('responder', { mensagens: ['O Plano Completo é sob cotação. Um consultor prepara a sua.'], justificativa: J }),
      ]),
      fim(),
    ]);
    const { orquestrador, filaSaida } = montarAgente(prisma, { llm });

    const r = await orquestrador.processar(conversa.id, SEM_SINAIS);

    expect(r).toBe('ok');
    const resultado = (llm.entradas[1]!.messages.at(-1)!.content as Array<{ is_error?: boolean; content: string }>)[0]!;
    expect(resultado.is_error).toBe(true);
    expect(resultado.content).toMatch(/valor/i);
    const ia = (await mensagensDa(conversa.id)).filter((m) => m.autor === 'ia');
    expect(ia.map((m) => m.texto)).toEqual(['O Plano Completo é sob cotação. Um consultor prepara a sua.']);
    expect(filaSaida!.adds.map((a) => a.data.messageId)).toEqual([ia[0]!.id]);
    expect((await acoesDa(conversa.id)).map((a) => a.status)).toEqual(['recusada', 'aplicada']);
  });

  it('dois bloqueios no mesmo turno → transferência para humano e resultado ok', async () => {
    const { conversa } = await fx.conversa('quanto custa?');
    const llm = new LlmFalso([
      resposta([ferramenta('responder', { mensagens: ['Sai por R$ 129,90.'], justificativa: J })]),
      resposta([ferramenta('responder', { mensagens: ['Consigo 10% de desconto pra você.'], justificativa: J })]),
      fim(),
    ]);
    const { orquestrador, filaResumo } = montarAgente(prisma, { llm });

    const r = await orquestrador.processar(conversa.id, SEM_SINAIS);

    expect(r).toBe('ok');
    expect(llm.chamadas).toBe(2);
    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conversa.id }, include: { setor: true } });
    expect(c.estado).toBe('AGUARDANDO_ESPECIALISTA');
    expect(c.setor?.nome).toBe('Comercial');
    expect((await mensagensDa(conversa.id)).filter((m) => m.autor === 'ia')).toHaveLength(0);
    expect(filaResumo.adds.length).toBeGreaterThan(0);
  });

  it('stop_reason refusal → AGUARDANDO_ESPECIALISTA com resumo; resultado recusa', async () => {
    const { conversa } = await fx.conversa('oi');
    const llm = new LlmFalso([resposta([], 'refusal')]);
    const { orquestrador, filaResumo } = montarAgente(prisma, { llm });

    const r = await orquestrador.processar(conversa.id, SEM_SINAIS);

    expect(r).toBe('recusa');
    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conversa.id } });
    expect(c.estado).toBe('AGUARDANDO_ESPECIALISTA');
    const ultima = await prisma.message.findFirstOrThrow({ where: { conversationId: conversa.id }, orderBy: { criadaEm: 'desc' } });
    expect(filaResumo.adds.map((a) => a.opts.jobId)).toContain(`resumo.${conversa.id}.${ultima.id}`);
    const turno = await prisma.agentTurn.findFirstOrThrow({ where: { conversationId: conversa.id } });
    expect(turno.resultado).toBe('recusa');
  });

  it('erro da API após retries → contingência "Já te respondo, só um instante." uma única vez + transferência; resultado falha', async () => {
    const { conversa } = await fx.conversa('oi');
    const llm = new LlmFalso([new Error('API indisponível (teste)')]);
    const { orquestrador } = montarAgente(prisma, { llm });

    expect(await orquestrador.processar(conversa.id, SEM_SINAIS)).toBe('falha');
    let c = await prisma.conversation.findUniqueOrThrow({ where: { id: conversa.id } });
    expect(c.estado).toBe('AGUARDANDO_ESPECIALISTA');

    // uma pessoa devolve à IA, o cliente escreve de novo e a API falha outra vez (dentro de 30 min)
    await prisma.conversation.update({ where: { id: conversa.id }, data: { estado: 'IA_ATIVA', versaoControle: { increment: 1 } } });
    await fx.cliente(conversa.id, 'alô?');
    expect(await orquestrador.processar(conversa.id, SEM_SINAIS)).toBe('falha');

    const contingencias = (await mensagensDa(conversa.id)).filter((m) => m.texto === TEXTO_CONTINGENCIA);
    expect(contingencias).toHaveLength(1);
    expect(contingencias[0]!.autor).toBe('sistema');
    c = await prisma.conversation.findUniqueOrThrow({ where: { id: conversa.id } });
    expect(c.estado).toBe('AGUARDANDO_ESPECIALISTA');
  });

  it('8 iterações sem encerrar → transferência; resultado falha', async () => {
    const { conversa } = await fx.conversa('oi');
    const llm = new LlmFalso([resposta([ferramenta('atualizar_contato', { cidade: 'Campinas', justificativa: J })])]);
    const { orquestrador } = montarAgente(prisma, { llm });

    expect(await orquestrador.processar(conversa.id, SEM_SINAIS)).toBe('falha');
    expect(llm.chamadas).toBe(8);
    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conversa.id } });
    expect(c.estado).toBe('AGUARDANDO_ESPECIALISTA');
  });

  it('conversa fora de IA_ATIVA no início → ignorado, LLM não chamado', async () => {
    const { conversa } = await fx.conversa('oi');
    await prisma.conversation.update({ where: { id: conversa.id }, data: { estado: 'HUMANO' } });
    const llm = new LlmFalso([fim()]);
    const { orquestrador } = montarAgente(prisma, { llm });

    expect(await orquestrador.processar(conversa.id, SEM_SINAIS)).toBe('ignorado');
    expect(llm.chamadas).toBe(0);
  });

  it('contato fora de numerosPermitidos → ignorado, LLM não chamado, nada enviado', async () => {
    const { conversa } = await fx.conversa('oi');
    await prisma.contact.update({
      where: { id: conversa.contactId },
      data: { e164: `+5511${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}` },
    });
    const llm = new LlmFalso([fim()]);
    const { orquestrador } = montarAgente(prisma, { llm });

    expect(await orquestrador.processar(conversa.id, SEM_SINAIS)).toBe('ignorado');
    expect(llm.chamadas).toBe(0);
    expect(await prisma.message.count({ where: { conversationId: conversa.id, autor: { not: 'cliente' } } })).toBe(0);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversa.id } })).estado).toBe('IA_ATIVA');
  });

  it('IA global desligada no início → ignorado, LLM não chamado', async () => {
    const { conversa } = await fx.conversa('oi');
    const llm = new LlmFalso([fim()]);
    const { orquestrador } = montarAgente(prisma, { llm, iaGlobal: () => false });

    expect(await orquestrador.processar(conversa.id, SEM_SINAIS)).toBe('ignorado');
    expect(llm.chamadas).toBe(0);
  });

  it('histórico: começa com user, termina com user, estado como {role:"system"} no fim; notas internas só no estado', async () => {
    const { conversa } = await fx.conversa(null);
    const ana = await prisma.user.create({
      data: { nome: `Ana T10b${fx.run}`, email: `ana.t10b.${fx.run}@teste.local`, papel: 'atendente', senhaHash: 'x' },
    });
    try {
      await fx.mensagem(conversa.id, { autor: 'ia', texto: 'Olá! Sou a assistente da Empresa Exemplo.' });
      await fx.cliente(conversa.id, 'oi, quero um plano pra minha loja');
      await fx.mensagem(conversa.id, { autor: 'ia', texto: 'Legal! Quantas pessoas trabalham aí?' });
      await fx.mensagem(conversa.id, { autor: 'atendente', texto: 'Oi, aqui é a Ana.', autorUsuarioId: ana.id });
      await fx.mensagem(conversa.id, { autor: 'sistema', tipo: 'nota_interna', texto: 'NOTA-SECRETA cliente prefere à tarde', status: null });
      await fx.mensagem(conversa.id, { autor: 'ia', texto: 'bolha cancelada', status: 'cancelada' });
      await fx.cliente(conversa.id, 'somos 8 pessoas');
      const llm = new LlmFalso([fim()]);
      const { orquestrador } = montarAgente(prisma, { llm });

      await orquestrador.processar(conversa.id, SEM_SINAIS);

      const msgs = llm.entradas[0]!.messages;
      expect(msgs[0]!.role).toBe('user');
      expect(msgs.at(-2)!.role).toBe('user');
      expect(msgs.at(-1)!.role).toBe('system');
      const textoDe = (m: (typeof msgs)[number]) =>
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      expect(textoDe(msgs.at(-1)!)).toContain('NOTA-SECRETA');
      expect(msgs.slice(0, -1).some((m) => textoDe(m).includes('NOTA-SECRETA'))).toBe(false);
      expect(msgs.some((m) => textoDe(m).includes('bolha cancelada'))).toBe(false);
      expect(msgs.some((m) => m.role === 'assistant' && textoDe(m).includes(`[Atendente Ana T10b${fx.run}] Oi, aqui é a Ana.`))).toBe(true);
      expect(textoDe(msgs.at(-2)!)).toContain('somos 8 pessoas');
      // prompt estável em bloco com cache_control
      expect(llm.entradas[0]!.system[0]).toMatchObject({ type: 'text', cache_control: { type: 'ephemeral' } });
    } finally {
      await prisma.message.deleteMany({ where: { autorUsuarioId: ana.id } });
      await prisma.user.delete({ where: { id: ana.id } });
    }
  });

  it('sinalizar_emergencia envia exatamente o texto fixo e mais nada', async () => {
    const { conversa } = await fx.conversa('sofri um acidente na estrada, preciso de ajuda');
    const op = await prisma.opportunity.create({ data: { contactId: conversa.contactId, etapa: 'aguardando_cotacao' } });
    const tarefa = await prisma.task.create({ data: { tipo: 'cotacao', titulo: 'Cotação', opportunityId: op.id } });
    const llm = new LlmFalso([
      resposta([
        ferramenta('responder', { mensagens: ['Calma, vou te ajudar.'], justificativa: J }),
        ferramenta('sinalizar_emergencia', { tipo: 'acidente', descricao: 'Sofreu um acidente na estrada', justificativa: 'Relato de acidente.' }),
      ]),
      fim(),
    ]);
    const { orquestrador } = montarAgente(prisma, { llm });

    expect(await orquestrador.processar(conversa.id, { emergencia: true, interrupcao: false })).toBe('ok');

    expect(llm.chamadas).toBe(1);
    const saida = (await mensagensDa(conversa.id)).filter((m) => m.autor !== 'cliente' && m.tipo === 'texto');
    expect(saida.map((m) => [m.autor, m.texto])).toEqual([['sistema', TEXTO_EMERGENCIA]]);
    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conversa.id }, include: { setor: true } });
    expect(c).toMatchObject({ estado: 'AGUARDANDO_ESPECIALISTA', prioridade: 'emergencia' });
    expect(c.setor?.nome).toBe(SETOR_EMERGENCIA);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: tarefa.id } })).status).toBe('cancelada');
    const acoes = await acoesDa(conversa.id);
    expect(acoes.find((a) => a.ferramenta === 'responder')?.status).toBe('descartada');
    expect(acoes.find((a) => a.ferramenta === 'sinalizar_emergencia')?.status).toBe('aplicada');
  });

  it('registrar_interrupcao: consentimento revogado, texto fixo enviado, nada mais sai depois', async () => {
    const { conversa } = await fx.conversa(null);
    const antiga = await fx.mensagem(conversa.id, { autor: 'ia', texto: 'Oi, ainda tem interesse?', status: 'pendente', versaoControle: 0 });
    const mensagem = await fx.cliente(conversa.id, 'por favor parem de me mandar mensagem');
    const llm = new LlmFalso([
      resposta([
        ferramenta('registrar_interrupcao', { justificativa: 'Cliente pediu para parar.' }),
        ferramenta('responder', { mensagens: ['Tudo bem!'], justificativa: J }),
      ]),
      fim(),
    ]);
    const { orquestrador, filaSaida } = montarAgente(prisma, { llm });

    expect(await orquestrador.processar(conversa.id, { emergencia: false, interrupcao: true })).toBe('ok');

    expect(llm.chamadas).toBe(1);
    const consent = await prisma.consent.findUniqueOrThrow({ where: { contactId: conversa.contactId } });
    expect(consent).toMatchObject({ status: 'revogado', mensagemOrigemId: mensagem!.id });
    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conversa.id } });
    expect(c.versaoControle).toBe(1);
    expect((await prisma.message.findUniqueOrThrow({ where: { id: antiga.id } })).status).toBe('cancelada');
    const msgs = await mensagensDa(conversa.id);
    const confirmacao = msgs.filter((m) => m.texto === TEXTO_INTERRUPCAO);
    expect(confirmacao).toHaveLength(1);
    expect(confirmacao[0]).toMatchObject({ autor: 'sistema', confirmadoRestrito: true, status: 'pendente' });
    expect(msgs.filter((m) => m.autor === 'ia' && m.status === 'pendente')).toHaveLength(0);
    expect(filaSaida!.adds.map((a) => a.data.messageId)).toEqual([confirmacao[0]!.id]);
  });

  it('mover_etapa para venda_confirmada → is_error, oportunidade não muda', async () => {
    const { conversa } = await fx.conversa('quero fechar');
    const op = await prisma.opportunity.create({ data: { contactId: conversa.contactId, etapa: 'contratacao_em_andamento' } });
    const llm = new LlmFalso([
      resposta([ferramenta('mover_etapa', { etapa: 'venda_confirmada', justificativa: J })]),
      fim(),
    ]);
    const { orquestrador } = montarAgente(prisma, { llm });

    await orquestrador.processar(conversa.id, SEM_SINAIS);

    const resultado = (llm.entradas[1]!.messages.at(-1)!.content as Array<{ is_error?: boolean; content: string }>)[0]!;
    expect(resultado.is_error).toBe(true);
    expect(resultado.content).toMatch(/não pode confirmar vendas/);
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: op.id } })).etapa).toBe('contratacao_em_andamento');
    expect((await acoesDa(conversa.id))[0]!.status).toBe('recusada');
  });

  it('pré-classificador marcou emergência e o turno não chamou sinalizar_emergencia → prioridade volta a normal e a trilha registra o motivo', async () => {
    const { conversa } = await fx.conversa('o que eu faço numa emergência fora do horário?');
    await prisma.conversation.update({ where: { id: conversa.id }, data: { prioridade: 'emergencia' } });
    const llm = new LlmFalso([
      resposta([
        ferramenta('responder', {
          mensagens: ['Você fala com o suporte por aqui mesmo, conforme o plano e as condições contratadas.'],
          justificativa: 'Dúvida geral sobre o suporte, não é emergência.',
        }),
      ]),
      fim(),
    ]);
    const { orquestrador, publicados } = montarAgente(prisma, { llm });

    expect(await orquestrador.processar(conversa.id, { emergencia: true, interrupcao: false })).toBe('ok');

    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conversa.id } })).prioridade).toBe('normal');
    const evento = await prisma.message.findFirstOrThrow({ where: { conversationId: conversa.id, tipo: 'evento' } });
    expect(evento.texto).toContain('Possível emergência descartada pela IA');
    expect(evento.texto).toContain('não é emergência');
    expect(
      publicados.some(
        (p) => p.tipo === 'agent.action' && String((p.payload.item as { titulo: string }).titulo).includes('Possível emergência descartada'),
      ),
    ).toBe(true);
  });

  it('grava AgentTurn.usage e modelo de cada chamada', async () => {
    const { conversa } = await fx.conversa('oi');
    const llm = new LlmFalso([
      resposta(
        [ferramenta('responder', { mensagens: ['Oi! Tudo bem?'], justificativa: J })],
        'tool_use',
        usoTokens(100, 20, { cache_read_input_tokens: 50 }),
      ),
      resposta([], 'end_turn', usoTokens(120, 5)),
    ]);
    const { orquestrador } = montarAgente(prisma, { llm });

    await orquestrador.processar(conversa.id, SEM_SINAIS);

    const turno = await prisma.agentTurn.findFirstOrThrow({ where: { conversationId: conversa.id } });
    expect(turno.modelo).toBe('claude-opus-5-5');
    expect(turno.resultado).toBe('ok');
    expect(turno.finalizadoEm).not.toBeNull();
    const usage = turno.usage as { total: Record<string, number>; chamadas: Array<Record<string, unknown>> };
    expect(usage.total).toMatchObject({ input_tokens: 220, output_tokens: 25, cache_read_input_tokens: 50 });
    expect(usage.chamadas).toHaveLength(2);
    expect(usage.chamadas[0]).toMatchObject({ modelo: 'claude-opus-5-5', stop_reason: 'tool_use', input_tokens: 100 });
  });

  it('versão muda enquanto o LLM pensa → ações descartadas, nada gravado, abortado', async () => {
    const { conversa } = await fx.conversa('é para a minha empresa');
    const llm = new LlmFalso([
      async () => {
        await prisma.conversation.update({ where: { id: conversa.id }, data: { estado: 'HUMANO', versaoControle: { increment: 1 } } });
        return resposta([
          ferramenta('registrar_item', { categoria: 'Empresa', justificativa: J }),
          ferramenta('responder', { mensagens: ['Legal!'], justificativa: J }),
        ]);
      },
    ]);
    const { orquestrador } = montarAgente(prisma, { llm });

    expect(await orquestrador.processar(conversa.id, SEM_SINAIS)).toBe('abortado');

    expect(await prisma.interestItem.count({ where: { contactId: conversa.contactId } })).toBe(0);
    expect((await mensagensDa(conversa.id)).filter((m) => m.autor === 'ia')).toHaveLength(0);
    const acoes = await acoesDa(conversa.id);
    expect(acoes.map((a) => [a.ferramenta, a.status, a.justificativa])).toEqual([
      ['registrar_item', 'descartada', 'Resposta descartada: atendimento assumido'],
      ['responder', 'descartada', 'Resposta descartada: atendimento assumido'],
    ]);
  });
});
