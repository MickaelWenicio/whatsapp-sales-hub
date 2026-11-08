import { TEXTO_EMERGENCIA, TEXTO_INTERRUPCAO } from '@sales-hub/shared';

/**
 * Roteiros de conversa da base fictícia, para um negócio genérico de serviços por assinatura.
 * Texto do cliente: tom natural de WhatsApp. Texto da IA e da equipe: o único preço citado é
 * "a partir de R$ 69,90/mês" (Plano Essencial); Plano Completo e Soluções para Empresas são "sob cotação".
 */
export const EMPRESA = process.env.EMPRESA_NOME?.trim() || 'Empresa Exemplo';

/** Catálogo da demo (mesmos slugs do seed base). */
export const PRODUTOS = {
  'plano-essencial': 'Plano Essencial',
  'plano-completo': 'Plano Completo',
  'solucoes-empresas': 'Soluções para Empresas',
} as const;
export type SlugProduto = keyof typeof PRODUTOS;
/** Nome com artigo, para as frases ("o Plano Completo", "as Soluções para Empresas"). */
export const PRODUTOS_COM_ARTIGO: Record<SlugProduto, string> = {
  'plano-essencial': 'o Plano Essencial',
  'plano-completo': 'o Plano Completo',
  'solucoes-empresas': 'as Soluções para Empresas',
};

export type Acao = { ferramenta: string; entrada: Record<string, unknown>; justificativa: string };
export type Passo = {
  de: 'cliente' | 'ia' | 'atendente' | 'sistema' | 'nota' | 'evento';
  texto: string;
  tipo?: 'texto' | 'documento' | 'imagem';
  acoes?: Acao[];
  /** Começa uma nova sessão (outro dia / outro momento). */
  sessao?: boolean;
};
export type Ctx = {
  nome: string;
  /** Categoria do item de interesse (ex.: "Plano residencial"). */
  categoria: string;
  /** Descrição do item de interesse (ex.: "família de 4 pessoas"). */
  item: string;
  /** Como o cliente diz para quem é o serviço (ex.: "É pra família toda, somos 4"). */
  paraQuem: string;
  /** Nome do produto de interesse com artigo (ex.: "o Plano Completo"). */
  produto: string;
  cidade: string;
  atendente: string;
  equipeQtd: number;
  /** Setor que recebe emergências e implantações. */
  setorSuporte: string;
};
export type Resumo = { querOQue: string; jaInformou: string[]; objecao: string | null; proximoPasso: string };
export type RoteiroId =
  | 'qualificacao'
  | 'empresa'
  | 'objecao_preco'
  | 'intencao_contratar'
  | 'emergencia'
  | 'interrupcao'
  | 'transferencia'
  | 'atendimento_humano';

export type Roteiro = { id: RoteiroId; passos: (c: Ctx) => Passo[]; resumo: (c: Ctx) => Resumo };

const PRECO = 'a partir de R$ 69,90/mês';

export const ROTEIROS: Record<RoteiroId, Roteiro> = {
  qualificacao: {
    id: 'qualificacao',
    passos: (c) => [
      { de: 'cliente', texto: 'Oi, boa tarde! Vi o anúncio de vocês. Queria saber como funcionam os planos', sessao: true },
      {
        de: 'ia',
        texto: `Olá, ${c.nome}! Aqui é a assistente da ${EMPRESA}. O Plano Essencial sai ${PRECO} e já inclui atendimento pelo WhatsApp e painel online. Posso te fazer duas perguntinhas pra indicar o melhor caminho?`,
        acoes: [{ ferramenta: 'atualizar_contato', entrada: { nome: c.nome, cidade: c.cidade }, justificativa: 'Cliente se apresentou e informou a cidade.' }],
      },
      { de: 'cliente', texto: `Pode sim. ${c.paraQuem}` },
      {
        de: 'ia',
        texto: 'Show! E você precisa mais do básico ou de algo com relatórios e suporte prioritário?',
        acoes: [{ ferramenta: 'registrar_item', entrada: { categoria: c.categoria }, justificativa: 'Cliente disse para quem é o serviço.' }],
      },
      { de: 'cliente', texto: 'O básico resolve, mas quero entender o que muda no outro' },
      {
        de: 'ia',
        texto: 'Perfeito. E hoje você usa algum serviço parecido ou resolve tudo por conta própria?',
        acoes: [{ ferramenta: 'registrar_item', entrada: { descricao: c.item }, justificativa: 'Cliente detalhou o tamanho do que precisa.' }],
      },
      { de: 'cliente', texto: `Uso o de outra empresa, mas o suporte demora demais. Aqui em ${c.cidade} ninguém resolve rápido` },
      {
        de: 'ia',
        texto: 'Entendo, suporte lento cansa mesmo. No Plano Completo o suporte é prioritário, e ele é sob cotação. Quer conhecer os dois pra comparar?',
        acoes: [{ ferramenta: 'registrar_interesse', entrada: { produto: 'plano-completo', solucaoAtual: 'Serviço de outra empresa', preocupacao: 'suporte' }, justificativa: 'Preocupação principal é o suporte; quer comparar os dois planos.' }],
      },
      { de: 'cliente', texto: 'Quero saber dos dois', sessao: true },
      {
        de: 'ia',
        texto: `Combinado! Vou pedir a cotação do Plano Completo pro nosso time e já te retorno. O Plano Essencial fica ${PRECO}.`,
        acoes: [{ ferramenta: 'solicitar_cotacao', entrada: { observacoes: `Plano Completo: ${c.item}, ${c.cidade}, quer suporte prioritário.` }, justificativa: 'Qualificação completa; a cotação do Plano Completo depende do time.' }],
      },
      { de: 'cliente', texto: 'Beleza, aguardo' },
      { de: 'ia', texto: 'Pode deixar, assim que tiver o valor eu te chamo por aqui.' },
    ],
    resumo: (c) => ({
      querOQue: `Plano Essencial ou Plano Completo (${c.item})`,
      jaInformou: ['Para quem é o serviço', 'Necessidade principal', 'Cidade', 'Solução atual'],
      objecao: null,
      proximoPasso: 'Aguardando cotação do Plano Completo',
    }),
  },

  empresa: {
    id: 'empresa',
    passos: (c) => [
      { de: 'cliente', texto: `Bom dia. Tenho uma empresa com ${c.equipeQtd} funcionários e queria uma solução pra equipe toda`, sessao: true },
      {
        de: 'ia',
        texto: 'Bom dia! Pra empresas a gente monta uma proposta sob cotação, sem fidelidade e com implantação em até 48h. Me conta: quantas pessoas vão usar e em quantas unidades?',
        acoes: [{ ferramenta: 'registrar_interesse', entrada: { produto: 'solucoes-empresas' }, justificativa: 'Empresa com equipe própria; atendimento específico para empresas.' }],
      },
      { de: 'cliente', texto: `São ${c.equipeQtd}, divididos em duas unidades. A gente atende o estado todo` },
      {
        de: 'ia',
        texto: 'Entendi. Vocês precisam de relatório por unidade, painel para os gestores ou integração com algum sistema?',
        acoes: [{ ferramenta: 'registrar_item', entrada: { categoria: c.categoria, descricao: c.item, quantidade: c.equipeQtd }, justificativa: 'Cliente informou o tamanho da equipe e as unidades.' }],
      },
      { de: 'cliente', texto: 'Relatório por unidade e painel pros gestores, principalmente. Integração também seria bom' },
      {
        de: 'ia',
        texto: 'Anotado. Vou pedir uma cotação para a empresa e um especialista te chama pra fechar os detalhes.',
        acoes: [{ ferramenta: 'solicitar_cotacao', entrada: { observacoes: `${c.equipeQtd} pessoas em 2 unidades; relatório por unidade, painel para gestores e integração.` }, justificativa: 'Proposta para empresa exige cotação personalizada.' }],
      },
      { de: 'cliente', texto: 'Pode ser. Me manda por aqui mesmo', sessao: true },
      { de: 'ia', texto: 'Combinado! Assim que a cotação ficar pronta, o time envia por aqui.' },
    ],
    resumo: (c) => ({
      querOQue: `Soluções para Empresas para uma equipe de ${c.equipeQtd} pessoas`,
      jaInformou: ['Tamanho da equipe', 'Número de unidades', 'Relatório por unidade e painel para gestores'],
      objecao: null,
      proximoPasso: 'Cotação para empresa em preparo pelo time',
    }),
  },

  objecao_preco: {
    id: 'objecao_preco',
    passos: (c) => [
      { de: 'cliente', texto: 'Recebi o valor do Plano Completo... achei caro, a outra empresa cobra menos', sessao: true },
      {
        de: 'ia',
        texto: `Entendo, ${c.nome}. Vale comparar o que cada um inclui. O Plano Completo da ${EMPRESA} vem com suporte prioritário, relatórios e sem fidelidade. Quer que eu peça ao time uma condição melhor pro seu caso?`,
        acoes: [{ ferramenta: 'registrar_objecao', entrada: { tipo: 'preco', descricao: 'Acha o Plano Completo caro frente a outra empresa.' }, justificativa: 'Cliente comparou preço com concorrente.' }],
      },
      { de: 'cliente', texto: 'Quanto ficaria no melhor caso?' },
      {
        de: 'ia',
        texto: `O valor do Plano Completo é sob cotação e depende do que você precisa. Já o Plano Essencial sai ${PRECO}. Posso te explicar essa opção?`,
      },
      { de: 'cliente', texto: 'Vou pensar, tá apertado esse mês', sessao: true },
      {
        de: 'ia',
        texto: 'Sem problema! Posso te chamar na semana que vem pra ver se melhora?',
        acoes: [{ ferramenta: 'registrar_objecao', entrada: { tipo: 'momento', descricao: 'Orçamento apertado neste mês.' }, justificativa: 'Cliente adiou a decisão por questão de orçamento.' }],
      },
      { de: 'cliente', texto: 'Pode sim' },
    ],
    resumo: () => ({
      querOQue: 'Plano Completo',
      jaInformou: ['Cotação recebida', 'Comparou com outra empresa'],
      objecao: 'Preço acima do que esperava',
      proximoPasso: 'Retornar na semana que vem',
    }),
  },

  intencao_contratar: {
    id: 'intencao_contratar',
    passos: (c) => [
      { de: 'cliente', texto: 'Gostei da proposta. Como faço pra fechar?', sessao: true },
      {
        de: 'ia',
        texto: `Que bom, ${c.nome}! Vou avisar o time que você quer contratar e um atendente te passa os próximos passos. Pode me confirmar seu nome completo?`,
        acoes: [{ ferramenta: 'sinalizar_intencao', entrada: { sinais: 'Pediu para fechar a contratação.' }, justificativa: 'Cliente pediu para fechar a contratação.' }],
      },
      { de: 'cliente', texto: `${c.nome} mesmo, só vou mandar meu documento e o comprovante de endereço` },
      {
        de: 'ia',
        texto: 'Perfeito! Pode enviar a foto dos documentos por aqui quando quiser.',
        acoes: [{ ferramenta: 'atualizar_contato', entrada: { nome: c.nome }, justificativa: 'Nome confirmado pelo cliente.' }],
      },
      { de: 'cliente', texto: 'Mando amanhã cedo', sessao: true },
      { de: 'cliente', texto: '[o cliente enviou um documento]', tipo: 'documento' },
      {
        de: 'ia',
        texto: `Recebido! Já passei pro time de contratação e ${c.atendente} entra em contato com você ainda hoje.`,
        acoes: [{ ferramenta: 'transferir_para_humano', entrada: { motivo: 'contratação em andamento' }, justificativa: 'Documento recebido; contratação segue com a equipe.' }],
      },
      { de: 'cliente', texto: 'Ok, obrigado!' },
    ],
    resumo: (c) => ({
      querOQue: `Contratar ${c.produto} (${c.item})`,
      jaInformou: ['Nome completo', 'Documento do titular'],
      objecao: null,
      proximoPasso: `${c.atendente} conclui a contratação`,
    }),
  },

  emergencia: {
    id: 'emergencia',
    passos: (c) => [
      { de: 'cliente', texto: 'Oi, bom dia. Já sou cliente de vocês', sessao: true },
      { de: 'ia', texto: `Bom dia, ${c.nome}! Em que posso te ajudar?` },
      { de: 'cliente', texto: 'SOCORRO acabaram de assaltar a minha loja, levaram tudo!!' },
      {
        de: 'sistema',
        texto: TEXTO_EMERGENCIA,
        acoes: [
          { ferramenta: 'sinalizar_emergencia', entrada: { descricao: 'Cliente relatou um assalto agora há pouco.' }, justificativa: 'Relato de assalto; texto fixo de emergência enviado.' },
          { ferramenta: 'transferir_para_humano', entrada: { motivo: 'emergência', destino: c.setorSuporte }, justificativa: 'Emergência encaminhada a uma pessoa da equipe.' },
        ],
      },
      { de: 'evento', texto: `Conversa marcada como emergência e encaminhada para ${c.setorSuporte}` },
      { de: 'cliente', texto: 'Eu estava fechando a loja quando aconteceu. Já liguei pra polícia' },
    ],
    resumo: () => ({
      querOQue: 'Caso urgente: cliente relatou um assalto',
      jaInformou: ['O que aconteceu', 'Já acionou a polícia'],
      objecao: null,
      proximoPasso: 'Equipe de suporte orientando o cliente',
    }),
  },

  interrupcao: {
    id: 'interrupcao',
    passos: () => [
      { de: 'cliente', texto: 'oi, quanto custa o plano de vocês?', sessao: true },
      { de: 'ia', texto: `Olá! O Plano Essencial sai ${PRECO}. É pra uso pessoal ou pra uma empresa?` },
      { de: 'cliente', texto: 'ah deixa, vou ver com outro lugar', sessao: true },
      { de: 'ia', texto: 'Tudo bem! Se mudar de ideia é só chamar.' },
      {
        de: 'cliente',
        texto: 'podem parar de me mandar mensagem por favor',
      },
      {
        de: 'sistema',
        texto: TEXTO_INTERRUPCAO,
        acoes: [{ ferramenta: 'registrar_interrupcao', entrada: { motivo: 'pedido do cliente' }, justificativa: 'Cliente pediu para não receber mais mensagens; consentimento revogado.' }],
      },
    ],
    resumo: () => ({
      querOQue: 'Nada (pediu para não ser contatado)',
      jaInformou: [],
      objecao: null,
      proximoPasso: 'Não contatar mais',
    }),
  },

  transferencia: {
    id: 'transferencia',
    passos: (c) => [
      { de: 'cliente', texto: `Quero falar com uma pessoa, preciso negociar ${c.produto}`, sessao: true },
      {
        de: 'ia',
        texto: `Claro, ${c.nome}! Vou chamar um atendente pra te ajudar. Só um instante.`,
        acoes: [{ ferramenta: 'transferir_para_humano', entrada: { motivo: 'cliente pediu atendimento humano' }, justificativa: 'Pedido explícito de falar com uma pessoa.' }],
      },
      { de: 'evento', texto: `Conversa transferida para ${c.atendente}` },
      { de: 'cliente', texto: 'Obrigado, fico no aguardo' },
    ],
    resumo: (c) => ({
      querOQue: `Negociar ${c.produto} (${c.item})`,
      jaInformou: ['Interesse'],
      objecao: null,
      proximoPasso: `${c.atendente} assume a negociação`,
    }),
  },

  atendimento_humano: {
    id: 'atendimento_humano',
    passos: (c) => [
      { de: 'cliente', texto: 'Boa tarde, queria saber do Plano Completo', sessao: true },
      {
        de: 'ia',
        texto: 'Boa tarde! O Plano Completo é sob cotação. Pra quantas pessoas seria e em qual cidade você está?',
        acoes: [{ ferramenta: 'registrar_interesse', entrada: { produto: 'plano-completo' }, justificativa: 'Cliente pediu o Plano Completo.' }],
      },
      { de: 'cliente', texto: `${c.paraQuem}, aqui em ${c.cidade}. Pode passar pra alguém me atender? Tenho umas dúvidas` },
      {
        de: 'ia',
        texto: 'Claro! Estou chamando um atendente agora.',
        acoes: [{ ferramenta: 'transferir_para_humano', entrada: { motivo: 'dúvidas específicas' }, justificativa: 'Cliente quer tirar dúvidas com uma pessoa.' }],
      },
      { de: 'evento', texto: `Conversa transferida para ${c.atendente}` },
      { de: 'atendente', texto: `Oi, ${c.nome}! Aqui é ${c.atendente}, da ${EMPRESA}. Vi que você quer o Plano Completo. Qual sua dúvida?`, sessao: true },
      { de: 'nota', texto: 'Cliente já tem cotação em andamento. Verificar valor com o time antes de ligar.' },
      { de: 'cliente', texto: 'Tem fidelidade? E se eu precisar de suporte fora do horário comercial?' },
      { de: 'atendente', texto: 'Não tem fidelidade, você cancela quando quiser. O suporte pelo WhatsApp tem horário estendido; as condições fora do horário eu confirmo e te passo detalhado.' },
      { de: 'cliente', texto: 'Beleza, aguardo então' },
    ],
    resumo: (c) => ({
      querOQue: `Plano Completo (${c.item})`,
      jaInformou: ['Para quem é o serviço', 'Cidade'],
      objecao: null,
      proximoPasso: `${c.atendente} envia as condições de suporte`,
    }),
  },
};

/** Mini-roteiros "últimas mensagens" por grupo de etapa. {perguntas, respostas} */
export type Curto = { cliente: string; ia: string; extra?: { cliente: string; ia: string } };

export function curtos(c: Ctx): Record<'topo' | 'meio' | 'fundo' | 'ganho' | 'perdido', Curto[]> {
  return {
    topo: [
      { cliente: `Oi, quanto custa o plano? ${c.paraQuem}`, ia: `Olá! O Plano Essencial sai ${PRECO}. Me conta o que você mais precisa que eu vejo a melhor opção.` },
      { cliente: 'Boa noite, vi o anúncio de vocês', ia: `Boa noite! Aqui é a assistente da ${EMPRESA}. Você procura um plano pra você ou pra uma empresa?` },
      { cliente: 'Quero saber como funciona o Plano Completo', ia: 'O Plano Completo inclui suporte prioritário, relatórios e painel online, e é sob cotação. Pra quantas pessoas seria?', extra: { cliente: c.paraQuem, ia: 'Anotado! Em qual cidade você está?' } },
    ],
    meio: [
      { cliente: 'Recebi a proposta, posso pagar no cartão?', ia: 'Posso confirmar essa condição com o time e te aviso. Prefere cartão ou boleto?' },
      { cliente: 'Tem desconto se eu fechar essa semana?', ia: 'Vou levar seu pedido pro time comercial e já te dou um retorno por aqui.' },
      { cliente: 'Pode me mandar a proposta de novo?', ia: 'Claro, vou pedir pro time reenviar agora mesmo.' },
    ],
    fundo: [
      { cliente: 'Já mandei os documentos, falta mais alguma coisa?', ia: 'Recebi sim! O time de contratação está conferindo e te retorna em breve.' },
      { cliente: 'Quando vocês começam a implantação?', ia: 'Assim que a contratação for concluída o time agenda a implantação com você.' },
    ],
    ganho: [
      { cliente: 'Já está tudo funcionando, obrigado!', ia: `Que bom, ${c.nome}! Qualquer dúvida é só chamar por aqui.` },
      { cliente: 'O painel já está mostrando os relatórios, muito bom', ia: 'Ótimo saber! Estamos à disposição.' },
    ],
    perdido: [
      { cliente: 'Fechei com outra empresa, obrigado', ia: `Obrigada por avisar, ${c.nome}! Se precisar, estamos por aqui.` },
      { cliente: 'No momento não vou conseguir, desculpa', ia: 'Sem problema! Quando for um bom momento, é só chamar.' },
    ],
  };
}
