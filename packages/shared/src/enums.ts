// Espelha os enums do Prisma (apps/api/prisma/schema.prisma). Mantenha em sincronia.
export const PAPEIS_USUARIO = ['dono', 'gestor', 'atendente'] as const;
export type PapelUsuario = (typeof PAPEIS_USUARIO)[number];

export const ESTADOS_CONVERSA = ['IA_ATIVA', 'HUMANO', 'IA_PAUSADA', 'AGUARDANDO_ESPECIALISTA', 'ENCERRADA'] as const;
export type EstadoConversa = (typeof ESTADOS_CONVERSA)[number];

export const PRIORIDADES = ['normal', 'alta', 'emergencia'] as const;
export type Prioridade = (typeof PRIORIDADES)[number];

export const AUTORES_MENSAGEM = ['cliente', 'ia', 'atendente', 'sistema'] as const;
export type AutorMensagem = (typeof AUTORES_MENSAGEM)[number];

export const TIPOS_MENSAGEM = ['texto', 'imagem', 'documento', 'audio', 'video', 'figurinha', 'nota_interna', 'evento'] as const;
export type TipoMensagem = (typeof TIPOS_MENSAGEM)[number];

export const STATUS_MENSAGEM = ['pendente', 'enviando', 'enviada', 'entregue', 'lida', 'falhou', 'cancelada'] as const;
export type StatusMensagem = (typeof STATUS_MENSAGEM)[number];

/** Na ordem do funil. */
export const ETAPAS = [
  'novo_lead',
  'em_atendimento',
  'qualificacao_concluida',
  'aguardando_cotacao',
  'proposta_enviada',
  'em_negociacao',
  'contratacao_em_andamento',
  'venda_confirmada',
  'perdido',
] as const;
export type Etapa = (typeof ETAPAS)[number];

export const PREOCUPACOES = ['preco', 'qualidade', 'prazo', 'suporte', 'outra'] as const;
export type Preocupacao = (typeof PREOCUPACOES)[number];

export const TIPOS_OBJECAO = ['preco', 'confianca', 'necessidade', 'momento', 'concorrente', 'outro'] as const;
export type TipoObjecao = (typeof TIPOS_OBJECAO)[number];

export const ORIGENS_CONTATO = ['whatsapp_organico', 'site', 'campanha', 'indicacao', 'importacao'] as const;
export type OrigemContato = (typeof ORIGENS_CONTATO)[number];

export const STATUS_CLIENTE = ['lead', 'cliente_ativo', 'ex_cliente'] as const;
export type StatusCliente = (typeof STATUS_CLIENTE)[number];

export const STATUS_CONSENTIMENTO = ['concedido', 'revogado'] as const;
export type StatusConsentimento = (typeof STATUS_CONSENTIMENTO)[number];

export const TIPOS_TAREFA = ['cotacao', 'retorno', 'encaminhar_contratacao', 'pos_venda', 'entrega', 'outro'] as const;
export type TipoTarefa = (typeof TIPOS_TAREFA)[number];

export const STATUS_TAREFA = ['aberta', 'concluida', 'cancelada'] as const;
export type StatusTarefa = (typeof STATUS_TAREFA)[number];

export const STATUS_ACAO_AGENTE = ['aplicada', 'sugerida', 'pendente_aprovacao', 'recusada', 'descartada'] as const;
export type StatusAcaoAgente = (typeof STATUS_ACAO_AGENTE)[number];

export const TIPOS_ATOR = ['ia', 'humano', 'sistema'] as const;
export type TipoAtor = (typeof TIPOS_ATOR)[number];

export const ESTADOS_NUMERO = ['conectado', 'reconectando', 'desconectado'] as const;
export type EstadoNumero = (typeof ESTADOS_NUMERO)[number];

export const ORIGENS_DEMO = ['seed', 'ao_vivo'] as const;
export type OrigemDemo = (typeof ORIGENS_DEMO)[number];

/** Rótulos das etapas em pt-BR (frase normal, só a primeira letra maiúscula). */
export const ROTULOS_ETAPA: Record<Etapa, string> = {
  novo_lead: 'Novo lead',
  em_atendimento: 'Em atendimento',
  qualificacao_concluida: 'Qualificação concluída',
  aguardando_cotacao: 'Aguardando cotação',
  proposta_enviada: 'Proposta enviada',
  em_negociacao: 'Em negociação',
  contratacao_em_andamento: 'Contratação em andamento',
  venda_confirmada: 'Venda confirmada',
  perdido: 'Perdido',
};
