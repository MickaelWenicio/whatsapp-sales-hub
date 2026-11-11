import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PainelService } from './painel.service';

const now = new Date('2026-11-11T15:00:00.000Z');
function ambiente(estado = 'HUMANO', restrito = false) {
  const messages: any[] = [];
  const queued: string[] = [];
  const events: any[] = [];
  const conv: any = {
    id: 'c1',
    numeroId: 'n1',
    estado,
    versaoControle: 1,
    naoLidas: 2,
    prioridade: 'normal',
    contactId: 'p1',
    ultimaMensagemEm: now,
    janelaAteEm: now,
    contact: {
      id: 'p1',
      nome: 'Ana',
      e164: '+5511999999999',
      oportunidades: [],
      consentimento: restrito ? { status: 'revogado' } : null,
    },
    numero: { id: 'n1', ficticio: false, instanciaEvolution: 'teste', estado: 'conectado' },
    responsavel: null,
    setor: null,
    mensagens: [],
  };
  const db: any = {
    contact: {
      upsert: async ({ create }: any) => ({ id: 'p1', ...create }),
      findUnique: async () => conv.contact,
      count: async () => 0,
    },
    opportunity: { findMany: async () => [], count: async () => 0 },
    task: { findMany: async () => [] },
    inboundEvent: { create: async () => ({ id: 'event1' }) },
    conversation: {
      findUnique: async ({ where }: any) => (where.id === 'c1' ? conv : null),
      findMany: async () => [conv],
      update: async ({ data }: any) => Object.assign(conv, data),
      upsert: async () => conv,
    },
    message: {
      create: async ({ data }: any) => {
        const msg = {
          id: `m${messages.length}`,
          motivoFalha: null,
          citadaId: null,
          status: null,
          criadaEm: now,
          autorUsuario: { id: 'u1', nome: 'Operador' },
          ...data,
        };
        messages.push(msg);
        return msg;
      },
      findMany: async () => messages.slice().reverse(),
      update: async ({ where, data }: any) =>
        Object.assign(
          messages.find((m) => m.id === where.id),
          data,
        ),
    },
    whatsAppNumber: { findUnique: async () => conv.numero, findFirst: async () => conv.numero },
    $queryRaw: async () => [{ id: 'c1' }],
  };
  db.$transaction = async (fn: any) => fn(db);
  const control: any = {
    assumir: async () => {
      conv.estado = 'HUMANO';
    },
  };
  const output: any = {
    enfileirar: async (id: string) => {
      queued.push(id);
    },
  };
  const realtime: any = {
    publicar: async (tipo: string, payload: any) => {
      events.push({ tipo, payload });
    },
  };
  const settings: any = { numerosPermitidos: async () => [] };
  const channel: any = {
    obterQr: async () => ({ base64: 'data:image/png;base64,QR', pairingCode: '123' }),
    estadoConexao: async () => ({ estado: 'desconectado' }),
  };
  const config: any = { get: () => false };
  const inbound: any[] = [];
  const service = new PainelService(
    db,
    control,
    output,
    realtime,
    settings,
    {} as any,
    channel,
    config,
    { add: async (_name: string, payload: any) => inbound.push(payload) } as any,
  );
  return {
    service,
    conv,
    messages,
    queued,
    events,
    db,
    inbound,
    output,
    settings,
    config,
    channel,
  };
}

describe('PainelService: fronteira segura do painel', () => {
  it('rejeita envio vazio antes de persistir ou enfileirar', async () => {
    const a = ambiente();
    await expect(
      a.service.enviar('c1', 'u1', { texto: '  ', assumir: false }),
    ).rejects.toMatchObject({ status: 400 });
    expect(a.messages).toHaveLength(0);
    expect(a.queued).toEqual([]);
  });
  it('exige confirmação de assumir quando IA está ativa', async () => {
    const a = ambiente('IA_ATIVA');
    await expect(
      a.service.enviar('c1', 'u1', { texto: 'Olá', assumir: false }),
    ).rejects.toMatchObject({ status: 409 });
    expect(a.messages).toHaveLength(0);
    expect(a.conv.estado).toBe('IA_ATIVA');
  });
  it('assume e persiste mensagem do operador pendente antes de enfileirar', async () => {
    const a = ambiente('IA_ATIVA');
    const dto = await a.service.enviar('c1', 'u1', { texto: ' Olá ', assumir: true });
    expect(a.conv.estado).toBe('HUMANO');
    expect(dto).toMatchObject({
      conversationId: 'c1',
      texto: 'Olá',
      autor: 'atendente',
      status: 'pendente',
      criadaEm: '2026-11-11T15:00:00.000Z',
    });
    expect(a.messages[0].autorUsuarioId).toBe('u1');
    expect(a.queued).toEqual([dto.id]);
  });
  it('exige confirmação explícita para contato restrito', async () => {
    const a = ambiente('HUMANO', true);
    await expect(
      a.service.enviar('c1', 'u1', { texto: 'Olá', assumir: false }),
    ).rejects.toMatchObject({ status: 409 });
    expect(a.messages).toHaveLength(0);
  });
  it('nota é interna e nunca entra na fila WhatsApp', async () => {
    const a = ambiente();
    const dto = await a.service.nota('c1', 'u1', { texto: 'Ligar amanhã' });
    expect(dto).toMatchObject({ tipo: 'nota_interna', status: null, texto: 'Ligar amanhã' });
    expect(a.queued).toEqual([]);
  });
  it('ler zera não lidas e publica a conversa atualizada', async () => {
    const a = ambiente();
    await a.service.ler('c1');
    expect(a.conv.naoLidas).toBe(0);
    expect(a.events.at(-1)).toMatchObject({
      tipo: 'conversation.updated',
      payload: { conversa: { naoLidas: 0 } },
    });
  });
  it('retorna 404 legível para conversa inexistente', async () => {
    const a = ambiente();
    await expect(a.service.mensagens('ausente', {})).rejects.toMatchObject({ status: 404 });
  });
  it('mensagens mantém ordem cronológica e DTO ISO', async () => {
    const a = ambiente();
    await a.service.nota('c1', 'u1', { texto: 'Primeira' });
    await a.service.nota('c1', 'u1', { texto: 'Segunda' });
    const result = await a.service.mensagens('c1', {});
    expect(result.itens.map((m) => m.texto)).toEqual(['Primeira', 'Segunda']);
    expect(result.temMais).toBe(false);
  });
  it('QR retorna contrato do canal e bloqueia número fictício', async () => {
    const a = ambiente();
    expect(await a.service.qr('n1')).toEqual({
      base64: 'data:image/png;base64,QR',
      pairingCode: '123',
    });
    a.conv.numero.ficticio = true;
    await expect(a.service.qr('n1')).rejects.toMatchObject({ status: 400 });
  });
  it('rejeita lista de destinos demo malformada', async () => {
    const a = ambiente();
    await expect(a.service.definirPermitidos({ numeros: ['123'] }, 'u1')).rejects.toMatchObject({
      status: 400,
    });
  });
  it('novo chat normaliza telefone e não envia mensagem até o operador compor', async () => {
    const a = ambiente();
    expect(
      await (a.service as any).novaConversa({ e164: '(11) 99999-9999', nome: 'Ana' }, 'u1'),
    ).toEqual({ conversationId: 'c1' });
    expect(a.messages).toEqual([]);
    expect(a.queued).toEqual([]);
  });
  it('novo chat rejeita telefone sem DDD', async () => {
    const a = ambiente();
    await expect(
      (a.service as any).novaConversa({ e164: '99999-9999' }, 'u1'),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('simulador enfileira entrada exclusivamente fictícia', async () => {
    const a = ambiente();
    a.conv.contact.e164 = '+5500999999999';
    await expect((a.service as any).simular({ contactId: 'p1', texto: 'Olá' })).resolves.toEqual({
      conversationId: 'c1',
    });
    expect(a.inbound[0]).toMatchObject({
      numeroId: 'n1',
      evento: { fromMe: false, texto: 'Olá', de: '+5500999999999' },
    });
    expect(a.queued).toEqual([]);
  });
  it('simulador rejeita contato real para evitar misturar a demonstração', async () => {
    const a = ambiente();
    await expect(
      (a.service as any).simular({ contactId: 'p1', texto: 'Olá' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(a.inbound).toEqual([]);
  });
  it('visão geral vazia informa zeros reais e conversões sem denominador nulas', async () => {
    const a = ambiente();
    a.db.conversation.findMany = async () => [];
    const dto = await (a.service as any).visaoGeral('30');
    expect(dto.periodoDias).toBe(30);
    expect(dto.funil).toHaveLength(9);
    expect(dto.funil[0]).toEqual({ etapa: 'novo_lead', contagem: 0, conversaoProxima: null });
    expect(dto.atribuicao).toEqual({ ia: 0, humano: 0, misto: 0 });
    expect(dto.temDadosDemo).toBe(false);
  });
  it('identifica conversa fictícia nos itens sem alterar DTO base', async () => {
    const a = ambiente();
    a.conv.origemDemo = 'seed';
    const dto = await a.service.listar({}, 'u1');
    expect(dto.itens[0]).toMatchObject({ ficticio: true, temDadosDemo: true });
  });
  it('fila indisponível deixa mensagem recuperável como falhou', async () => {
    const a = ambiente();
    a.output.enfileirar = async () => {
      throw new Error('Redis indisponível');
    };
    await expect(
      a.service.enviar('c1', 'u1', { texto: 'Olá', assumir: false }),
    ).rejects.toMatchObject({ status: 503 });
    expect(a.messages).toHaveLength(1);
    expect(a.messages[0]).toMatchObject({ texto: 'Olá', status: 'falhou' });
    expect(a.events.at(-1)).toMatchObject({
      tipo: 'message.updated',
      payload: { status: 'falhou' },
    });
  });
  it('conexão indisponível rejeita antes de assumir ou criar mensagem', async () => {
    const a = ambiente('IA_ATIVA');
    a.conv.numero.estado = 'desconectado';
    await expect(
      a.service.enviar('c1', 'u1', { texto: 'Olá', assumir: true }),
    ).rejects.toMatchObject({ status: 409 });
    expect(a.conv.estado).toBe('IA_ATIVA');
    expect(a.messages).toEqual([]);
  });
  it('destino demo não autorizado fica enfileirado para simulação mesmo desconectado', async () => {
    const a = ambiente();
    a.config.get = () => true;
    a.conv.contact.e164 = '+5500999999999';
    a.conv.numero.estado = 'desconectado';
    expect(
      await a.service.enviar('c1', 'u1', { texto: 'Somente simulação', assumir: false }),
    ).toMatchObject({ status: 'pendente' });
    expect(a.queued).toHaveLength(1);
  });
  it('destino real fora da allowlist falha explicitamente em vez de fingir envio', async () => {
    const a = ambiente();
    a.config.get = () => true;
    await expect(
      a.service.enviar('c1', 'u1', { texto: 'Mensagem real', assumir: false }),
    ).rejects.toMatchObject({ status: 409 });
    expect(a.messages).toEqual([]);
    expect(a.queued).toEqual([]);
  });
  it('novo chat recebe posição recente na lista antes da primeira mensagem', async () => {
    const a = ambiente();
    let creation: any;
    a.db.conversation.upsert = async ({ create }: any) => {
      creation = create;
      return a.conv;
    };
    await a.service.novaConversa({ e164: '(11) 99999-9999' }, 'u1');
    expect(creation.ultimaMensagemEm).toBeInstanceOf(Date);
    expect(creation.ultimaMensagemEm.getTime()).toBeGreaterThan(Date.now() - 5000);
  });
  it('QR identifica Evolution indisponível antes de aceitar QR vazio', async () => {
    const a = ambiente();
    a.channel.estadoConexao = async () => ({ estado: 'erro' });
    a.channel.obterQr = async () => ({ base64: null, pairingCode: null });
    await expect(a.service.qr('n1')).rejects.toMatchObject({ status: 503 });
  });
  it('QR vazio para WhatsApp já conectado não inventa indisponibilidade', async () => {
    const a = ambiente();
    a.channel.estadoConexao = async () => ({ estado: 'conectado' });
    a.channel.obterQr = async () => ({ base64: null, pairingCode: null });
    expect(await a.service.qr('n1')).toEqual({ base64: null, pairingCode: null });
  });
  it('destino demo autorizado exige conexão real para enviar', async () => {
    const a = ambiente();
    a.config.get = () => true;
    a.settings.numerosPermitidos = async () => ['+5511999999999'];
    a.conv.numero.estado = 'desconectado';
    await expect(
      a.service.enviar('c1', 'u1', { texto: 'Real autorizado', assumir: false }),
    ).rejects.toMatchObject({ status: 409 });
    expect(a.queued).toEqual([]);
  });
  it('atribuição considera apenas vendas confirmadas da mesma coorte do indicador', async () => {
    const a = ambiente();
    const today = new Date();
    a.db.opportunity.findMany = async () => [
      {
        id: 'won1',
        contactId: 'p1',
        criadaEm: today,
        etapa: 'venda_confirmada',
        contact: { nome: 'Ana', conversas: [] },
      },
      {
        id: 'lead1',
        contactId: 'p2',
        criadaEm: today,
        etapa: 'novo_lead',
        contact: { nome: 'Bruno', conversas: [] },
      },
      {
        id: 'oldWon',
        contactId: 'p3',
        criadaEm: new Date('2020-01-01'),
        etapa: 'venda_confirmada',
        contact: { nome: 'Cris', conversas: [] },
      },
      {
        id: 'unknownWon',
        contactId: 'p4',
        criadaEm: today,
        etapa: 'venda_confirmada',
        contact: { nome: 'Dani', conversas: [] },
      },
    ];
    a.db.conversation.findMany = async () => [
      {
        contactId: 'p1',
        estado: 'ENCERRADA',
        mensagens: [
          { autor: 'ia', tipo: 'texto' },
          { autor: 'atendente', tipo: 'texto' },
        ],
      },
      { contactId: 'p2', estado: 'ENCERRADA', mensagens: [{ autor: 'ia', tipo: 'texto' }] },
      { contactId: 'p3', estado: 'ENCERRADA', mensagens: [{ autor: 'ia', tipo: 'texto' }] },
    ];
    const result = await a.service.visaoGeral('30');
    expect(result.indicadores.find((i) => i.chave === 'vendas')?.valor).toBe(2);
    expect(result.atribuicao).toEqual({ ia: 0, humano: 0, misto: 1 });
  });
});
