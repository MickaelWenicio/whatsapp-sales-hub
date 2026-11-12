import { describe, expect, it } from 'vitest';
import { OrquestradorDemo } from './orquestrador-demo';

function ambiente(telefone = '+5500999999999', demo: unknown = true) {
  const actions: any[] = [];
  const turns: any[] = [];
  const outputs: any[] = [];
  const summaries: any[] = [];
  const consents: any[] = [];
  const events: any[] = [];
  const conv: any = {
    id: 'c1',
    contactId: 'p1',
    numeroId: 'n1',
    estado: 'IA_ATIVA',
    versaoControle: 2,
    prioridade: 'normal',
    responsavel: null,
    setor: null,
    naoLidas: 1,
    contact: {
      id: 'p1',
      e164: telefone,
      nome: 'Ana',
      cidade: null,
      itens: [],
      oportunidades: [],
      consentimento: null,
    },
    mensagens: [
      {
        id: 'm1',
        autor: 'cliente',
        texto: 'Quero saber o preço do plano',
        tipo: 'texto',
        criadaEm: new Date(),
      },
    ],
  };
  let global = true;
  const db: any = {
    conversation: {
      findUnique: async () => conv,
      update: async ({ data }: any) => Object.assign(conv, data),
    },
    agentTurn: {
      create: async ({ data }: any) => {
        const turn = { id: 't1', ...data };
        turns.push(turn);
        return turn;
      },
      update: async ({ data }: any) => Object.assign(turns[0], data),
    },
    agentAction: {
      create: async ({ data }: any) => {
        const action = { id: 'a1', criadoEm: new Date(), ...data };
        actions.push(action);
        return action;
      },
    },
    conversationSummary: { upsert: async ({ create }: any) => summaries.push(create) },
    consent: { upsert: async ({ create }: any) => consents.push(create) },
    sector: { findFirst: async () => ({ id: 's1' }) },
    message: {
      create: async ({ data }: any) => ({ id: 'control1', criadaEm: new Date(), ...data }),
    },
    systemSetting: { findUnique: async () => ({ valor: global }) },
    $queryRaw: async () => [{ id: 'c1' }],
  };
  db.$transaction = async (fn: any) => fn(db);
  const saida: any = {
    criarBolhasIa: async (p: any) => {
      outputs.push({ tipo: 'ia', ...p });
      return ['out1'];
    },
    criarMensagemSistema: async (p: any) => {
      outputs.push({ tipo: 'sistema', ...p });
      return 'out1';
    },
  };
  const eventos: any = {
    publicar: async (tipo: string, payload: any) => events.push({ tipo, payload }),
  };
  const settings: any = { iaGlobalAtiva: async () => global };
  const config: any = { get: () => demo };
  const service = new OrquestradorDemo(db, settings, saida, eventos, config);
  return {
    service,
    conv,
    turns,
    actions,
    outputs,
    summaries,
    consents,
    events,
    setGlobal: (v: boolean) => {
      global = v;
    },
  };
}
const sinais = { emergencia: false, interrupcao: false };

describe('OrquestradorDemo: roteiro local somente para telefone fictício', () => {
  it.each([
    ['+5511999999999', true],
    ['+5500999999999', false],
    ['+5500999999999', 'false'],
  ])('ignora destino %s no modo %s sem gravar turno ou chamar saída', async (telefone, demo) => {
    const a = ambiente(telefone as string, demo);
    expect(await a.service.processar('c1', sinais)).toBe('ignorado');
    expect(a.turns).toEqual([]);
    expect(a.outputs).toEqual([]);
  });
  it('nunca responde sob controle humano ou interruptor desligado', async () => {
    const a = ambiente();
    a.conv.estado = 'HUMANO';
    expect(await a.service.processar('c1', sinais)).toBe('ignorado');
    a.conv.estado = 'IA_ATIVA';
    a.setGlobal(false);
    expect(await a.service.processar('c1', sinais)).toBe('ignorado');
    expect(a.outputs).toEqual([]);
  });
  it('responde o Plano Essencial com preço demonstrativo e pergunta o item de interesse sem inventar fatos', async () => {
    const a = ambiente();
    expect(await a.service.processar('c1', sinais)).toBe('respondido');
    expect(a.outputs[0]).toMatchObject({
      tipo: 'ia',
      conversationId: 'c1',
      versao: 2,
      agentTurnId: 't1',
    });
    expect(a.outputs[0].textos.join(' ')).toContain('69,90');
    expect(a.outputs[0].textos.join(' ')).toMatch(/quantas pessoas/i);
    expect(a.turns[0]).toMatchObject({ modelo: 'demonstracao-local-sem-llm', resultado: 'ok' });
    expect(a.actions[0]).toMatchObject({
      ferramenta: 'responder',
      status: 'aplicada',
      mensagemOrigemId: 'm1',
    });
    expect(a.summaries[0].querOQue).toMatch(/Demonstração/);
    expect(a.summaries[0].jaInformou).toEqual(['Quero saber o preço do plano']);
    expect(a.events).toContainEqual({ tipo: 'summary.updated', payload: { conversationId: 'c1' } });
    expect(a.events.find((e) => e.tipo === 'agent.action')).toMatchObject({
      payload: { item: { tipo: 'acao_ia', conversationId: 'c1' } },
    });
  });
  it('Plano Completo é sob cotação e quando o item existe pergunta cidade', async () => {
    const a = ambiente();
    a.conv.mensagens[0].texto = 'Quero o plano completo para minha empresa';
    await a.service.processar('c1', sinais);
    expect(a.outputs[0].textos.join(' ')).toMatch(/sob cotação/);
    expect(a.outputs[0].textos.join(' ')).toMatch(/cidade/);
  });
  it.each([
    ['Olá! Gostaria de saber mais sobre os planos de vocês.', /69,90/],
    ['Quanto custa?', /69,90/],
    ['Quero um orçamento para a minha empresa', /sob cotação/],
  ])('reconhece frase genérica do simulador: %s', async (frase, esperado) => {
    const a = ambiente();
    a.conv.mensagens[0].texto = frase;
    expect(await a.service.processar('c1', sinais)).toBe('respondido');
    expect(a.outputs[0].textos.join(' ')).toMatch(esperado);
  });
  it('pedido de parada grava consentimento revogado e pausa após confirmação fixa', async () => {
    const a = ambiente();
    a.conv.mensagens[0].texto = 'Não quero mais receber mensagens';
    expect(await a.service.processar('c1', { emergencia: false, interrupcao: true })).toBe(
      'escalado',
    );
    expect(a.consents[0]).toMatchObject({
      contactId: 'p1',
      status: 'revogado',
      mensagemOrigemId: 'm1',
    });
    expect(a.conv.estado).toBe('IA_PAUSADA');
    expect(a.outputs[0]).toMatchObject({ tipo: 'sistema', confirmadoRestrito: true });
    expect(a.outputs[0].texto).toMatch(/não vamos mais/);
  });
  it('emergência usa orientação fixa e encaminha para o suporte', async () => {
    const a = ambiente();
    a.conv.mensagens[0].texto = 'Assaltaram a loja agora';
    expect(await a.service.processar('c1', { emergencia: true, interrupcao: false })).toBe(
      'escalado',
    );
    expect(a.conv.estado).toBe('AGUARDANDO_ESPECIALISTA');
    expect(a.conv.prioridade).toBe('emergencia');
    expect(a.outputs[0].texto).toContain('190');
  });
  it('não duplica resposta quando última mensagem já é de saída', async () => {
    const a = ambiente();
    a.conv.mensagens.unshift({ id: 'out', autor: 'ia', tipo: 'texto', texto: 'Já respondi' });
    expect(await a.service.processar('c1', sinais)).toBe('ignorado');
    expect(a.outputs).toEqual([]);
  });
});
