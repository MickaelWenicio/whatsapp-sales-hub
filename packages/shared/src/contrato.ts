// Contrato entre a API (NestJS) e o painel (Next.js). Datas são strings ISO 8601.
import type {
  AutorMensagem,
  EstadoConversa,
  EstadoNumero,
  Etapa,
  OrigemContato,
  PapelUsuario,
  Prioridade,
  StatusAcaoAgente,
  StatusCliente,
  StatusConsentimento,
  StatusMensagem,
  StatusTarefa,
  TipoMensagem,
  TipoObjecao,
  TipoTarefa,
} from './enums';

export interface RefDTO {
  id: string;
  nome: string;
}

/** Campo preenchido pela IA: de qual mensagem veio e quando. */
export interface ProvenienciaIaDTO {
  mensagemId: string | null;
  em: string;
}
/** Chave = nome do campo (ex.: "nome", "cidade", "descricao"). */
export type CamposIaDTO = Record<string, ProvenienciaIaDTO>;

export type FiltroConversas =
  | 'todas'
  | 'nao_lidas'
  | 'ia'
  | 'aguardando_humano'
  | 'minhas'
  | 'intencao'
  | 'prioridade'
  | 'encerradas';

export interface MensagemDTO {
  id: string;
  conversationId: string;
  autor: AutorMensagem;
  tipo: TipoMensagem;
  texto: string | null;
  /** Nulo para mensagens de entrada. */
  status: StatusMensagem | null;
  motivoFalha: string | null;
  autorUsuario: RefDTO | null;
  criadaEm: string;
  citadaId: string | null;
}

export interface PreviaMensagemDTO {
  autor: AutorMensagem;
  tipo: TipoMensagem;
  texto: string | null;
  criadaEm: string;
}

export interface ConversaItemDTO {
  id: string;
  contato: { id: string; nome: string | null; e164: string; telefoneExibicao: string };
  estado: EstadoConversa;
  prioridade: Prioridade;
  responsavel: RefDTO | null;
  setor: RefDTO | null;
  naoLidas: number;
  ultimaMensagem: PreviaMensagemDTO | null;
  ultimaMensagemEm: string | null;
  /** Fim da janela de 24 h do WhatsApp; nulo se nunca houve mensagem do cliente. */
  janelaAteEm: string | null;
  /** Etapa da oportunidade aberta, se houver. */
  etapa: Etapa | null;
  /** Verdadeiro quando a etapa é contratacao_em_andamento. */
  intencao: boolean;
}

export interface ContatoDTO {
  id: string;
  nome: string | null;
  e164: string;
  telefoneExibicao: string;
  cidade: string | null;
  uf: string | null;
  origem: OrigemContato;
  statusCliente: StatusCliente;
  camposIa: CamposIaDTO;
}

/** O que o contato quer comprar ou contratar. */
export interface ItemInteresseDTO {
  id: string;
  categoria: string | null;
  descricao: string | null;
  quantidade: number | null;
  camposIa: CamposIaDTO;
}

export interface ObjecaoDTO {
  id: string;
  tipo: TipoObjecao;
  descricao: string;
  mensagemOrigemId: string | null;
  criadaEm: string;
}

export interface OportunidadeDetalheDTO {
  id: string;
  etapa: Etapa;
  etapaDesde: string;
  /** Slug do produto do catálogo. */
  produto: string | null;
  itemId: string | null;
  responsavel: RefDTO | null;
  proximaAcao: string | null;
  proximaAcaoEm: string | null;
  vencida: boolean;
  prioridade: Prioridade;
  /** O que o contato usa hoje (concorrente, solução própria, nada). */
  solucaoAtual: string | null;
  momentoCompra: string | null;
  preocupacao: string | null;
  prazoDecisao: string | null;
  objecoes: ObjecaoDTO[];
  camposIa: CamposIaDTO;
}

export interface ResumoDTO {
  querOQue: string;
  jaInformou: string[];
  objecao: string | null;
  proximoPasso: string;
  ultimaMensagemId: string | null;
  atualizadoEm: string;
}

export interface ConsentimentoDTO {
  status: StatusConsentimento;
  mensagemOrigemId: string | null;
  em: string;
}

export interface TarefaDTO {
  id: string;
  tipo: TipoTarefa;
  titulo: string;
  status: StatusTarefa;
  responsavel: RefDTO | null;
  prazoEm: string | null;
  vencida: boolean;
  opportunityId: string | null;
}

export interface ConversaDetalheDTO {
  conversa: ConversaItemDTO;
  contato: ContatoDTO;
  itens: ItemInteresseDTO[];
  oportunidade: OportunidadeDetalheDTO | null;
  resumo: ResumoDTO | null;
  consentimento: ConsentimentoDTO | null;
  tarefasAbertas: TarefaDTO[];
}

export interface TrilhaItemDTO {
  id: string;
  conversationId: string;
  tipo: 'acao_ia' | 'etapa' | 'controle';
  titulo: string;
  ferramenta?: string;
  justificativa?: string;
  mensagemOrigemId?: string;
  status?: StatusAcaoAgente;
  em: string;
}

export interface OportunidadeCardDTO {
  id: string;
  conversationId: string | null;
  contato: { id: string; nome: string | null; e164: string };
  item: { categoria: string | null; descricao: string | null } | null;
  produto: string | null;
  etapa: Etapa;
  etapaDesde: string;
  proximaAcao: string | null;
  proximaAcaoEm: string | null;
  vencida: boolean;
  responsavel: RefDTO | null;
  estadoConversa: EstadoConversa | null;
  /** Quando a IA moveu a oportunidade pela última vez, para o ícone das últimas 24 h. */
  movidaPelaIaEm: string | null;
  prioridade: Prioridade;
}

export type EstadoNumeroDTO = EstadoNumero | 'erro';

export interface NumeroDTO {
  id: string;
  rotulo: string;
  e164: string;
  telefoneExibicao: string;
  instancia: string;
  estado: EstadoNumeroDTO;
  ultimoEstadoEm: string | null;
  ultimaFalha: string | null;
  ficticio: boolean;
}

export type FormatoIndicador = 'numero' | 'percentual' | 'duracao_min';

export interface IndicadorDTO {
  chave: string;
  nome: string;
  /** Nulo quando não há dados suficientes no período. */
  valor: number | null;
  formato: FormatoIndicador;
  /** Variação em relação ao período anterior (fração; 0.1 = +10%), ou nulo. */
  variacao: number | null;
  periodo: string;
  definicao: string;
  origem: string;
}

export interface PrioridadeHojeDTO {
  tipo: 'intencao_sem_retorno' | 'transferencia_sem_resposta' | 'emergencia_aberta' | 'tarefa_vencida' | 'cotacao_vencendo';
  conversationId: string | null;
  opportunityId: string | null;
  taskId: string | null;
  contatoNome: string | null;
  /** Uma frase de contexto, já em pt-BR. */
  descricao: string;
  desde: string;
}

export interface FunilEtapaDTO {
  etapa: Etapa;
  contagem: number;
  /** Conversão para a etapa seguinte (fração), ou nulo. */
  conversaoProxima: number | null;
}

export interface AtribuicaoDTO {
  ia: number;
  humano: number;
  misto: number;
}

export interface VisaoGeralDTO {
  periodoDias: 7 | 30 | 90;
  prioridades: PrioridadeHojeDTO[];
  funil: FunilEtapaDTO[];
  indicadores: IndicadorDTO[];
  atribuicao: AtribuicaoDTO;
  temDadosDemo: boolean;
}

// Respostas paginadas e corpos de requisição

export interface ListaConversasDTO {
  itens: ConversaItemDTO[];
  proximoCursor: string | null;
}

export interface ListaMensagensDTO {
  itens: MensagemDTO[];
  temMais: boolean;
}

export type OportunidadesPorEtapaDTO = Record<Etapa, OportunidadeCardDTO[]>;

export interface EnviarMensagemBody {
  texto: string;
  assumir: boolean;
  confirmarRestrito?: boolean;
}

export interface TransferirBody {
  setorId?: string;
  usuarioId?: string;
  nota?: string;
}

export interface MoverOportunidadeBody {
  para: Etapa;
  motivoPerda?: string;
  evidencia?: { tipo: 'contrato_assinado' | 'pagamento_confirmado' | 'confirmacao_sistema'; observacao: string };
}

export interface SimuladorBody {
  contactId?: string;
  novoContato?: { nome: string };
  texto: string;
}

export interface UsuarioSessaoDTO {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
}
