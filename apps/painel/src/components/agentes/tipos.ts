/**
 * Agentes de WhatsApp do protótipo. Tudo aqui é visual: os agentes criados ficam só no
 * estado da tela. Nada é enviado para a API nem salvo no navegador.
 */
import { formatarTelefoneExibicao, normalizarTelefoneBr } from '@sales-hub/shared';

export type FuncaoAgente =
  | 'vendas'
  | 'pos_venda'
  | 'cobranca'
  | 'suporte'
  | 'agendamento'
  | 'personalizada';
export type TomVoz = 'consultivo' | 'acolhedor' | 'direto' | 'formal';
export type CorAvatar = 'noite' | 'sinal' | 'verde' | 'ameixa' | 'ambar';
export type OrigemNumero = 'operacao' | 'novo';
export type Horario = '24h' | 'comercial';
export type QuandoAudio = 'cliente_audio' | 'sempre' | 'longas';
export type DuracaoMax = '5' | '10' | '15';
export type VozPadrao = 'feminina_calorosa' | 'masculina_calma' | 'feminina_objetiva';
export type Objetivo = 'qualificar' | 'duvidas' | 'agendar' | 'recuperar';

export type AmostraVoz = {
  origem: 'arquivo' | 'gravacao';
  nome: string;
  tamanhoBytes: number;
  /** Só gravações têm duração conhecida; de arquivos lemos apenas nome e tamanho. */
  duracaoSeg: number | null;
};

export type RascunhoAgente = {
  nome: string;
  funcao: FuncaoAgente | '';
  descricao: string;
  tom: TomVoz;
  cor: CorAvatar;
  origemNumero: OrigemNumero;
  /** Só os dígitos já mascarados, sem o +55: "(82) 99999-9999". */
  numeroNovo: string;
  horario: Horario;
  audio: { ativo: boolean; quando: QuandoAudio };
  ligacoes: { ativo: boolean; transferirHumano: boolean; duracaoMax: DuracaoMax };
  clonar: { ativo: boolean; consentimento: boolean; amostra: AmostraVoz | null; vozGerada: boolean };
  vozPadrao: VozPadrao;
  objetivo: Objetivo;
  regrasTransferencia: string[];
  apresentacao: string;
};

export type StatusSimulado = 'simulacao' | 'pausado';
export type AgenteSimulado = RascunhoAgente & { id: string; status: StatusSimulado; criadoEm: string };

export const FUNCOES: { v: FuncaoAgente; t: string }[] = [
  { v: 'vendas', t: 'Vendas' },
  { v: 'pos_venda', t: 'Pós-venda' },
  { v: 'cobranca', t: 'Cobrança' },
  { v: 'suporte', t: 'Suporte ao cliente' },
  { v: 'agendamento', t: 'Agendamento e implantação' },
  { v: 'personalizada', t: 'Personalizada' },
];
export const TONS: { v: TomVoz; t: string; d: string }[] = [
  { v: 'consultivo', t: 'Consultivo', d: 'Pergunta antes de recomendar.' },
  { v: 'acolhedor', t: 'Acolhedor', d: 'Próximo e paciente.' },
  { v: 'direto', t: 'Direto', d: 'Respostas curtas e objetivas.' },
  { v: 'formal', t: 'Formal', d: 'Linguagem cuidadosa, sem gírias.' },
];
export const HORARIOS: { v: Horario | 'personalizado'; t: string }[] = [
  { v: '24h', t: '24 horas' },
  { v: 'comercial', t: 'Horário comercial (seg a sex, 8h às 18h)' },
  { v: 'personalizado', t: 'Personalizado' },
];
export const QUANDO_AUDIO: { v: QuandoAudio; t: string }[] = [
  { v: 'cliente_audio', t: 'Só quando o cliente mandar áudio' },
  { v: 'sempre', t: 'Sempre que fizer sentido' },
  { v: 'longas', t: 'Só em mensagens longas' },
];
export const DURACOES: { v: DuracaoMax; t: string }[] = [
  { v: '5', t: '5 min' },
  { v: '10', t: '10 min' },
  { v: '15', t: '15 min' },
];
export const VOZES_PADRAO: { v: VozPadrao; t: string }[] = [
  { v: 'feminina_calorosa', t: 'Feminina, calorosa' },
  { v: 'masculina_calma', t: 'Masculina, calma' },
  { v: 'feminina_objetiva', t: 'Feminina, objetiva' },
];
export const OBJETIVOS: { v: Objetivo; t: string }[] = [
  { v: 'qualificar', t: 'Qualificar e passar para vendas' },
  { v: 'duvidas', t: 'Resolver dúvidas' },
  { v: 'agendar', t: 'Agendar' },
  { v: 'recuperar', t: 'Recuperar clientes' },
];

/**
 * Cores do avatar: fundo suave + texto escuro, sempre a partir dos tokens da paleta.
 * `amostra` repete a cor em `data-checked:` porque o RadioGroupItem pinta o item marcado de Noite.
 */
export const CORES: { v: CorAvatar; t: string; amostra: string; avatar: string }[] = [
  { v: 'noite', t: 'Grafite', amostra: 'bg-noite data-checked:bg-noite', avatar: 'border-line bg-sunken text-noite' },
  { v: 'sinal', t: 'Índigo', amostra: 'bg-sinal data-checked:bg-sinal', avatar: 'border-ia-border bg-ia-bg text-ia-fg' },
  { v: 'verde', t: 'Verde', amostra: 'bg-hum-solid data-checked:bg-hum-solid', avatar: 'border-hum-border bg-hum-bg text-hum-fg' },
  { v: 'ameixa', t: 'Ameixa', amostra: 'bg-esp-solid data-checked:bg-esp-solid', avatar: 'border-esp-border bg-esp-bg text-esp-fg' },
  { v: 'ambar', t: 'Âmbar', amostra: 'bg-pau-solid data-checked:bg-pau-solid', avatar: 'border-pau-border bg-pau-bg text-pau-fg' },
];

export const ETAPAS = ['Identidade', 'Canal', 'Voz e chamadas', 'Comportamento', 'Revisão'] as const;

export const DESCRICAO_MAX = 280;
export const APRESENTACAO_MAX = 500;
export const FRASE_PREVIA = `Oi! Aqui é a Ana, da ${process.env.NEXT_PUBLIC_EMPRESA_NOME ?? 'Empresa Exemplo'}. Como posso te ajudar hoje?`;

export const rotulo = <T extends string>(lista: { v: T; t: string }[], v: T | '') =>
  lista.find((x) => x.v === v)?.t ?? '';

export function rascunhoVazio(): RascunhoAgente {
  return {
    nome: '',
    funcao: '',
    descricao: '',
    tom: 'consultivo',
    cor: 'sinal',
    origemNumero: 'operacao',
    numeroNovo: '',
    horario: 'comercial',
    audio: { ativo: false, quando: 'cliente_audio' },
    ligacoes: { ativo: false, transferirHumano: true, duracaoMax: '10' },
    clonar: { ativo: false, consentimento: false, amostra: null, vozGerada: false },
    vozPadrao: 'feminina_calorosa',
    objetivo: 'qualificar',
    regrasTransferencia: ['Cliente pede para falar com uma pessoa', 'Assunto de emergência'],
    apresentacao: '',
  };
}

/** Máscara "(DD) 9XXXX-XXXX" sobre os dígitos; o +55 fica fixo ao lado do campo. */
export function mascararCelular(valor: string): string {
  let d = valor.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** E.164 de um celular BR (DDD + 9 dígitos começando por 9) ou null. */
export function celularE164(mascarado: string): string | null {
  const d = mascarado.replace(/\D/g, '');
  if (d.length !== 11) return null;
  const e164 = normalizarTelefoneBr(d);
  return e164 && /^\+55\d{2}9\d{8}$/.test(e164) ? e164 : null;
}

export function exibirCelular(mascarado: string): string {
  const e164 = celularE164(mascarado);
  return e164 ? formatarTelefoneExibicao(e164) : mascarado;
}

export function formatarBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

export function formatarTempo(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function iniciaisAgente(nome: string): string {
  // "Ana, do pós-venda" vira "AP": palavras com hífen contam como uma e conectivos são ignorados.
  const partes = nome
    .replace(/[^\p{L}\s-]/gu, ' ')
    .split(/\s+/)
    .map((p) => p.replace(/^-+|-+$/g, ''))
    .filter((p) => p && !/^(d[aeo]s?|e)$/i.test(p));
  if (partes.length === 0) return '?';
  const a = partes[0]![0] ?? '';
  const b = partes.length > 1 ? (partes[partes.length - 1]![0] ?? '') : '';
  return (a + b).toUpperCase();
}

/* ─── Validação por etapa ─────────────────────────────────────────────────── */

export type Erros = Partial<Record<string, string>>;

export type Alterar = (
  p: Partial<RascunhoAgente> | ((r: RascunhoAgente) => Partial<RascunhoAgente>),
) => void;

/** O que toda etapa do assistente recebe. */
export type PropsEtapa = {
  r: RascunhoAgente;
  alterar: Alterar;
  erros: Erros;
  /** Erros só aparecem depois da primeira tentativa de avançar na etapa. */
  mostrarErros: boolean;
};

export function validarEtapa(
  etapa: number,
  r: RascunhoAgente,
  ctx: { temNumeroOperacao: boolean },
): Erros {
  const e: Erros = {};
  if (etapa === 0) {
    const nome = r.nome.trim();
    if (!nome) e.nome = 'Informe o nome do agente.';
    else if (nome.length < 2) e.nome = 'O nome precisa ter pelo menos 2 letras.';
    if (!r.funcao) e.funcao = 'Escolha a função do agente.';
    if (!r.descricao.trim()) e.descricao = 'Descreva o que o agente faz e com quem ele fala.';
  }
  if (etapa === 1) {
    if (r.origemNumero === 'operacao' && !ctx.temNumeroOperacao)
      e.numero = 'A operação ainda não tem número configurado. Adicione um novo número para este agente.';
    if (r.origemNumero === 'novo') {
      if (!r.numeroNovo.replace(/\D/g, '')) e.numeroNovo = 'Informe o número de WhatsApp do agente.';
      else if (!celularE164(r.numeroNovo))
        e.numeroNovo = 'Informe um celular válido com DDD, como (82) 99999-9999.';
    }
  }
  if (etapa === 2 && r.clonar.ativo) {
    if (!r.clonar.amostra) e.amostra = 'Envie ou grave uma amostra da voz.';
    if (!r.clonar.consentimento)
      e.consentimento = 'Confirme a autorização da pessoa dona da voz para continuar.';
    else if (r.clonar.amostra && !r.clonar.vozGerada) e.vozGerada = 'Gere a voz clonada para continuar.';
  }
  if (etapa === 3) {
    if (r.regrasTransferencia.length === 0)
      e.regras = 'Mantenha pelo menos uma situação em que o agente transfere para uma pessoa.';
  }
  return e;
}

/** Id do campo que recebe o foco quando a etapa tem erro. */
export const CAMPO_DO_ERRO: Record<string, string> = {
  nome: 'agente-nome',
  funcao: 'agente-funcao',
  descricao: 'agente-descricao',
  numero: 'agente-origem-operacao',
  numeroNovo: 'agente-numero-novo',
  amostra: 'agente-amostra',
  consentimento: 'agente-consentimento',
  vozGerada: 'agente-gerar-voz',
  regras: 'agente-nova-regra',
};

export function novoId(): string {
  return `ag_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
