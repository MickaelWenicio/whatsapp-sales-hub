import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { ETAPAS, PREOCUPACOES, TIPOS_OBJECAO } from '@sales-hub/shared';

/**
 * Ferramentas da Fase 1 (spec §9.3). O zod valida no backend (inclusive limites que o modo strict
 * não aceita); o JSON schema enviado à API sai do zod sem as palavras de limite. Toda ferramenta
 * escreve e exige `justificativa`. conversationId/contactId/mensagemOrigemId vêm do servidor.
 */
const justificativa = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe('Uma frase curta (até 200 caracteres) explicando por que você fez isso. Aparece para a equipe.');
const texto = z.string().trim().min(1).max(500);
const definir = <T extends z.ZodRawShape>(description: string, shape: T, terminal = false) => ({
  description,
  terminal,
  schema: z.strictObject({ ...shape, justificativa }),
});

export const FERRAMENTAS = {
  responder: definir(
    'A única forma de falar com o cliente. Envia de 1 a 4 bolhas curtas de WhatsApp (até 500 caracteres cada), com no máximo uma pergunta no turno. Texto fora desta ferramenta é descartado.',
    { mensagens: z.array(texto).min(1).max(4).describe('De 1 a 4 bolhas curtas, na ordem de envio.') },
  ),
  atualizar_contato: definir('Grava dados que o cliente informou sobre si: nome, cidade, UF (sigla) e melhor horário para contato.', {
    nome: texto.optional(),
    cidade: texto.optional(),
    uf: z.string().trim().length(2).optional().describe('Sigla do estado, ex.: SP.'),
    melhorHorario: texto.optional(),
  }),
  registrar_item: definir(
    'Cria ou completa o item de interesse do cliente: o que ele quer comprar ou contratar. Para completar um item que já está no estado, informe o itemId dele.',
    {
      categoria: texto.optional().describe('Tipo do que o cliente procura, nas palavras dele (ex.: "Plano residencial", "Empresa pequena", "Projeto").'),
      descricao: texto.optional().describe('Detalhes do item (ex.: "2 unidades", "equipe de 15 pessoas").'),
      quantidade: z.number().int().min(1).max(100000).optional().describe('Quantidade, se o cliente informou.'),
      itemId: texto.optional(),
    },
  ),
  registrar_interesse: definir(
    'Registra o interesse comercial (o produto do catálogo) e cria a oportunidade do item se ainda não houver uma aberta.',
    {
      produto: texto.optional().describe('Slug do produto do catálogo que interessa ao cliente, exatamente como aparece no catálogo.'),
      solucaoAtual: texto.optional().describe('O que o cliente usa hoje (outro fornecedor, solução própria, nada), se disse.'),
      momentoCompra: texto.optional().describe('Quando o cliente pretende comprar ou trocar, se disse.'),
      preocupacao: z.enum(PREOCUPACOES).optional(),
      prazoDecisao: texto.optional(),
      itemId: texto.optional(),
    },
  ),
  mover_etapa: definir(
    'Move a oportunidade aberta no funil. Você não pode confirmar vendas. "perdido" exige motivoPerda.',
    { etapa: z.enum(ETAPAS), motivoPerda: texto.optional() },
  ),
  registrar_objecao: definir('Registra uma objeção do cliente na oportunidade aberta.', {
    tipo: z.enum(TIPOS_OBJECAO),
    descricao: texto,
  }),
  solicitar_cotacao: definir(
    'Pede à equipe comercial a cotação de um produto sem preço aprovado no catálogo. Cria a tarefa para um consultor e move a oportunidade para "Aguardando cotação". Use sempre que o cliente pedir um preço que não esteja aprovado no catálogo.',
    { observacoes: texto.optional().describe('O que o consultor precisa saber para cotar (item de interesse, quantidade, cidade, preocupação).') },
  ),
  sinalizar_intencao: definir(
    'Use quando o cliente mostrar intenção clara de contratar. Marca prioridade alta, cria a tarefa de contratação para uma pessoa e move para "Contratação em andamento".',
    { sinais: texto.describe('O que o cliente disse que mostra a intenção.') },
  ),
  transferir_para_humano: definir(
    'Passa a conversa para uma pessoa da equipe. Antes, avise o cliente com responder na mesma rodada.',
    { motivo: texto, destino: z.enum(['Comercial', 'Suporte', 'Pós-venda']).optional() },
    true,
  ),
  sinalizar_emergencia: definir(
    'Emergência (assalto, acidente, risco à saúde, pedido de socorro). O sistema envia só a mensagem oficial e passa para uma pessoa da equipe de suporte. Chame sozinha, sem responder.',
    { tipo: z.enum(['assalto', 'acidente', 'saude', 'outro']), descricao: texto },
    true,
  ),
  registrar_interrupcao: definir(
    'O cliente pediu para não receber mais mensagens. O sistema registra, confirma ao cliente e para os envios. Chame sozinha, sem responder.',
    {},
    true,
  ),
};

export type NomeFerramenta = keyof typeof FERRAMENTAS;
export const ehFerramenta = (n: string): n is NomeFerramenta => Object.prototype.hasOwnProperty.call(FERRAMENTAS, n);

const LIMITES_VALIDACAO = new Set([
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'pattern',
  '$schema',
]);

function semLimites(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(semLimites);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor)
        .filter(([chave]) => !LIMITES_VALIDACAO.has(chave))
        .map(([chave, conteudo]) => [chave, semLimites(conteudo)]),
    );
  }
  return valor;
}

let cache: Anthropic.Beta.BetaTool[] | null = null;

/** Definições na ordem fixa (estável para o cache do prompt). */
export function definicoesFerramentas(): Anthropic.Beta.BetaTool[] {
  cache ??= Object.entries(FERRAMENTAS).map(([name, f]) => ({
    name,
    description: f.description,
    strict: true,
    eager_input_streaming: true,
    input_schema: semLimites(z.toJSONSchema(f.schema)) as Anthropic.Beta.BetaTool.InputSchema,
  }));
  return cache;
}
