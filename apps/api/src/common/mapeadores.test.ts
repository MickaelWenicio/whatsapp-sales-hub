import { describe, expect, it } from 'vitest';
import {
  paraConversaItemDTO,
  paraMensagemDTO,
  paraNumeroDTO,
  paraOportunidadeCardDTO,
  paraTrilhaItemDTO,
} from './mapeadores';

const t = (iso: string) => new Date(iso);

describe('paraMensagemDTO', () => {
  const base = {
    id: 'm1',
    conversationId: 'c1',
    numeroId: 'n1',
    autor: 'atendente',
    tipo: 'texto',
    texto: 'Olá',
    status: 'entregue',
    idExterno: 'EXT1',
    motivoFalha: null,
    autorUsuarioId: 'u1',
    agentTurnId: null,
    versaoControle: 3,
    confirmadoRestrito: false,
    citadaId: 'm0',
    criadaEm: t('2026-11-11T12:00:00.000Z'),
  } as const;

  it('mapeia campos, data ISO e autor atendente', () => {
    const dto = paraMensagemDTO({ ...base, autorUsuario: { id: 'u1', nome: 'Ana' } } as never);
    expect(dto).toEqual({
      id: 'm1',
      conversationId: 'c1',
      autor: 'atendente',
      tipo: 'texto',
      texto: 'Olá',
      status: 'entregue',
      motivoFalha: null,
      autorUsuario: { id: 'u1', nome: 'Ana' },
      criadaEm: '2026-11-11T12:00:00.000Z',
      citadaId: 'm0',
    });
  });

  it('entrada: status nulo e sem autorUsuario; não vaza idExterno nem versaoControle', () => {
    const dto = paraMensagemDTO({ ...base, autor: 'cliente', status: null, autorUsuarioId: null, citadaId: null } as never);
    expect(dto.status).toBeNull();
    expect(dto.autorUsuario).toBeNull();
    expect(dto.citadaId).toBeNull();
    expect(dto).not.toHaveProperty('idExterno');
    expect(dto).not.toHaveProperty('versaoControle');
  });
});

describe('paraConversaItemDTO', () => {
  const conv = {
    id: 'c1',
    contactId: 'k1',
    numeroId: 'n1',
    estado: 'HUMANO',
    prioridade: 'alta',
    naoLidas: 2,
    ultimaMensagemEm: t('2026-11-11T12:00:00.000Z'),
    janelaAteEm: t('2026-11-12T12:00:00.000Z'),
    contact: {
      id: 'k1',
      nome: 'Cliente',
      e164: '+5511900000099',
      oportunidades: [{ etapa: 'contratacao_em_andamento' }],
    },
    responsavel: { id: 'u1', nome: 'Ana' },
    setor: { id: 's1', nome: 'Comercial' },
    mensagens: [{ autor: 'cliente', tipo: 'texto', texto: 'quero fechar', criadaEm: t('2026-11-11T12:00:00.000Z') }],
  };

  it('monta o item completo com intenção e prévia', () => {
    const dto = paraConversaItemDTO(conv as never);
    expect(dto).toEqual({
      id: 'c1',
      contato: { id: 'k1', nome: 'Cliente', e164: '+5511900000099', telefoneExibicao: '+55 (11) 90000-0099' },
      estado: 'HUMANO',
      prioridade: 'alta',
      responsavel: { id: 'u1', nome: 'Ana' },
      setor: { id: 's1', nome: 'Comercial' },
      naoLidas: 2,
      ultimaMensagem: {
        autor: 'cliente',
        tipo: 'texto',
        texto: 'quero fechar',
        criadaEm: '2026-11-11T12:00:00.000Z',
      },
      ultimaMensagemEm: '2026-11-11T12:00:00.000Z',
      janelaAteEm: '2026-11-12T12:00:00.000Z',
      etapa: 'contratacao_em_andamento',
      intencao: true,
    });
  });

  it('sem mensagens, sem oportunidade, sem responsável e sem setor', () => {
    const dto = paraConversaItemDTO({
      ...conv,
      mensagens: [],
      contact: { ...conv.contact, oportunidades: [] },
      responsavel: null,
      setor: null,
      ultimaMensagemEm: null,
      janelaAteEm: null,
    } as never);
    expect(dto).toMatchObject({
      ultimaMensagem: null,
      ultimaMensagemEm: null,
      janelaAteEm: null,
      etapa: null,
      intencao: false,
      responsavel: null,
      setor: null,
    });
  });
});

describe('paraNumeroDTO', () => {
  const n = {
    id: 'n1',
    rotulo: 'Comercial',
    e164: '+5511900000099',
    instanciaEvolution: 'sales-hub',
    estado: 'conectado',
    ultimoEstadoEm: t('2026-11-11T12:00:00.000Z'),
    ultimaFalha: null,
    ficticio: false,
  };

  it('mapeia estado e exibição', () => {
    expect(paraNumeroDTO(n as never)).toEqual({
      id: 'n1',
      rotulo: 'Comercial',
      e164: '+5511900000099',
      telefoneExibicao: '+55 (11) 90000-0099',
      instancia: 'sales-hub',
      estado: 'conectado',
      ultimoEstadoEm: '2026-11-11T12:00:00.000Z',
      ultimaFalha: null,
      ficticio: false,
    });
  });

  it('desconectado com ultimaFalha vira estado "erro" (última verificação falhou)', () => {
    expect(paraNumeroDTO({ ...n, estado: 'desconectado', ultimaFalha: 'timeout' } as never).estado).toBe('erro');
    expect(paraNumeroDTO({ ...n, estado: 'desconectado', ultimaFalha: null } as never).estado).toBe('desconectado');
  });
});

describe('paraOportunidadeCardDTO', () => {
  const agora = t('2026-11-11T12:00:00.000Z');
  const base = {
    id: 'o1',
    contactId: 'ct1',
    produto: 'plano-completo',
    etapa: 'em_atendimento',
    etapaDesde: t('2026-11-11T10:00:00.000Z'),
    proximaAcao: 'Ligar',
    proximaAcaoEm: t('2026-11-11T11:00:00.000Z'),
    prioridade: 'alta',
    contact: { id: 'ct1', nome: 'Rita', e164: '+5511999990000', conversas: [{ id: 'cv1', estado: 'IA_ATIVA' }] },
    item: { categoria: 'Empresa pequena', descricao: 'equipe de 15 pessoas' },
    responsavel: { id: 'u1', nome: 'Ana' },
    eventos: [{ criadoEm: t('2026-11-11T11:30:00.000Z') }],
  };

  it('mapeia campos, conversa, item de interesse, ia e vencida', () => {
    expect(paraOportunidadeCardDTO(base as never, agora)).toEqual({
      id: 'o1',
      conversationId: 'cv1',
      contato: { id: 'ct1', nome: 'Rita', e164: '+5511999990000' },
      item: { categoria: 'Empresa pequena', descricao: 'equipe de 15 pessoas' },
      produto: 'plano-completo',
      etapa: 'em_atendimento',
      etapaDesde: '2026-11-11T10:00:00.000Z',
      proximaAcao: 'Ligar',
      proximaAcaoEm: '2026-11-11T11:00:00.000Z',
      vencida: true,
      responsavel: { id: 'u1', nome: 'Ana' },
      estadoConversa: 'IA_ATIVA',
      movidaPelaIaEm: '2026-11-11T11:30:00.000Z',
      prioridade: 'alta',
    });
  });

  it('sem conversa, item, responsável, evento da IA nem próxima ação: nulos e não vencida', () => {
    const dto = paraOportunidadeCardDTO(
      {
        ...base,
        proximaAcao: null,
        proximaAcaoEm: null,
        item: null,
        responsavel: null,
        eventos: [],
        contact: { ...base.contact, conversas: [] },
      } as never,
      agora,
    );
    expect(dto).toMatchObject({
      conversationId: null,
      item: null,
      responsavel: null,
      estadoConversa: null,
      movidaPelaIaEm: null,
      proximaAcaoEm: null,
      vencida: false,
    });
  });

  it('próxima ação no futuro não está vencida', () => {
    const op = { ...base, proximaAcaoEm: t('2026-11-11T13:00:00.000Z') };
    expect(paraOportunidadeCardDTO(op as never, agora).vencida).toBe(false);
  });
});

describe('paraTrilhaItemDTO', () => {
  it('AgentAction: acao_ia com título pt-BR, justificativa e status', () => {
    const dto = paraTrilhaItemDTO({
      id: 'a1',
      agentTurnId: 'tu1',
      conversationId: 'cv1',
      ferramenta: 'registrar_item',
      entrada: {},
      resultado: null,
      justificativa: 'Cliente disse que tem um Argo',
      mensagemOrigemId: 'm1',
      status: 'aplicada',
      criadoEm: t('2026-11-11T12:00:00.000Z'),
    } as never);
    expect(dto).toEqual({
      id: 'a1',
      conversationId: 'cv1',
      tipo: 'acao_ia',
      titulo: 'Registrou o item de interesse',
      ferramenta: 'registrar_item',
      justificativa: 'Cliente disse que tem um Argo',
      mensagemOrigemId: 'm1',
      status: 'aplicada',
      em: '2026-11-11T12:00:00.000Z',
    });
  });

  it('AgentAction de ferramenta desconhecida usa título genérico e omite campos vazios', () => {
    const dto = paraTrilhaItemDTO({
      id: 'a2',
      conversationId: 'cv1',
      ferramenta: 'nova',
      justificativa: null,
      mensagemOrigemId: null,
      status: 'descartada',
      criadoEm: t('2026-11-11T12:00:00.000Z'),
    } as never);
    expect(dto.titulo).toBe('Executou nova');
    expect(dto).not.toHaveProperty('justificativa');
    expect(dto).not.toHaveProperty('mensagemOrigemId');
  });

  it('OpportunityEvent: etapa "Moveu para <rótulo>"', () => {
    const dto = paraTrilhaItemDTO(
      {
        id: 'e1',
        opportunityId: 'o1',
        de: 'em_atendimento',
        para: 'aguardando_cotacao',
        ator: 'ia',
        atorUsuarioId: null,
        justificativa: 'Pediu cotação',
        mensagemOrigemId: null,
        evidencia: null,
        criadoEm: t('2026-11-11T12:05:00.000Z'),
      } as never,
      'cv1',
    );
    expect(dto).toEqual({
      id: 'e1',
      conversationId: 'cv1',
      tipo: 'etapa',
      titulo: 'Moveu para Aguardando cotação',
      justificativa: 'Pediu cotação',
      em: '2026-11-11T12:05:00.000Z',
    });
  });

  it('Message de evento: controle com o texto como título', () => {
    const dto = paraTrilhaItemDTO({
      id: 'm9',
      conversationId: 'cv1',
      autor: 'sistema',
      tipo: 'evento',
      texto: 'Ana assumiu o atendimento',
      criadaEm: t('2026-11-11T12:10:00.000Z'),
    } as never);
    expect(dto).toEqual({
      id: 'm9',
      conversationId: 'cv1',
      tipo: 'controle',
      titulo: 'Ana assumiu o atendimento',
      em: '2026-11-11T12:10:00.000Z',
    });
  });
});
