/**
 * Conteúdo roteirizado do assistente (protótipo visual, sem backend).
 * Todos os números daqui são de demonstração e aparecem com o badge "Dados de demonstração".
 */
import type { LucideIcon } from 'lucide-react';
import { Bot, ChartColumn, ChartPie, Columns3, FileDown, Hourglass } from 'lucide-react';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type Acao =
  | { rotulo: string; icone: LucideIcon; href: string }
  | { rotulo: string; icone: LucideIcon; recurso: string; detalhe?: string };

/** Tipo do interesse do lead, para o ícone ao lado da descrição. */
export type TipoInteresse = 'pessoa' | 'empresa' | 'projeto';

export type Bloco =
  | { tipo: 'paragrafo'; texto: string }
  | { tipo: 'topicos'; titulo?: string; itens: string[] }
  | {
      tipo: 'tabela';
      titulo: string;
      legenda?: string;
      colunas: string[];
      linhas: string[][];
      /** cor do marcador de cada linha (rampa das etapas do funil) */
      marcadores?: string[];
      /** índice da linha que merece atenção */
      destaque?: number;
    }
  | {
      tipo: 'barras';
      titulo: string;
      legenda?: string;
      cabecalho: [string, string, string];
      /** sinal: série de dados; neutro: barras cinza com o maior item em Noite */
      tom: 'sinal' | 'neutro';
      itens: {
        rotulo: string;
        valor: number;
        valorTexto: string;
        detalhe: string;
        destaque?: boolean;
      }[];
    }
  | {
      tipo: 'indicadores';
      titulo: string;
      legenda?: string;
      itens: { rotulo: string; valor: string; detalhe: string }[];
    }
  | {
      tipo: 'leads';
      titulo: string;
      legenda?: string;
      itens: {
        nome: string;
        interesse: string;
        tipoInteresse: TipoInteresse;
        etapa: string;
        semRetorno: string;
      }[];
    }
  | {
      tipo: 'confirmacao';
      pergunta: string;
      itens: { nome: string; interesse: string; venceu: string }[];
      recurso: string;
      detalhe: string;
    }
  | { tipo: 'acoes'; itens: Acao[] }
  | { tipo: 'sugestoes'; titulo: string; itens: string[] };

export type Resposta = { blocos: Bloco[] };

export type MensagemChat =
  | { id: string; autor: 'usuario'; texto: string }
  | { id: string; autor: 'assistente'; resposta: Resposta; interrompidaEm?: number };

export type GrupoHistorico = 'hoje' | 'ontem' | 'semana';

export type Conversa = {
  id: string;
  titulo: string;
  grupo: GrupoHistorico;
  mensagens: MensagemChat[];
};

// ─── Texto: normalização, palavras e custo de exibição ─────────────────────

/** Minúsculas e sem acentos, para casar palavras-chave e a busca do histórico. */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Uma palavra exibível. `**trecho**` no texto vira ênfase por peso. */
export type Palavra = { t: string; forte: boolean; espaco: boolean };

const cachePalavras = new Map<string, Palavra[]>();

export function palavras(texto: string): Palavra[] {
  const pronto = cachePalavras.get(texto);
  if (pronto) return pronto;
  const saida: Palavra[] = [];
  let espacoPendente = false;
  texto.split('**').forEach((parte, i) => {
    const forte = i % 2 === 1;
    for (const pedaco of parte.split(/(\s+)/)) {
      if (!pedaco) continue;
      if (/^\s+$/.test(pedaco)) {
        espacoPendente = true;
        continue;
      }
      saida.push({ t: pedaco, forte, espaco: saida.length > 0 && espacoPendente });
      espacoPendente = false;
    }
  });
  cachePalavras.set(texto, saida);
  return saida;
}

/** Blocos visuais (tabela, gráfico, cartões) entram inteiros, com uma pausa equivalente a algumas palavras. */
const CUSTO_BLOCO_VISUAL = 6;

export function custoBloco(b: Bloco): number {
  switch (b.tipo) {
    case 'paragrafo':
      return palavras(b.texto).length;
    case 'topicos':
      return (b.titulo ? 1 : 0) + b.itens.reduce((s, i) => s + palavras(i).length, 0);
    case 'acoes':
    case 'sugestoes':
      return 1;
    default:
      return CUSTO_BLOCO_VISUAL;
  }
}

export function totalPalavras(r: Resposta): number {
  return r.blocos.reduce((s, b) => s + custoBloco(b), 0);
}

/** Quanto de cada bloco já pode aparecer. `null` = resposta completa. */
export function orcamentos(r: Resposta, visiveis: number | null): number[] {
  let restante = visiveis ?? Number.POSITIVE_INFINITY;
  return r.blocos.map((b) => {
    const disponivel = Math.max(0, Math.min(restante, custoBloco(b)));
    restante -= custoBloco(b);
    return disponivel;
  });
}

function textoSimples(texto: string, limite = Number.POSITIVE_INFINITY): string {
  return palavras(texto)
    .slice(0, limite)
    .map((p) => (p.espaco ? ` ${p.t}` : p.t))
    .join('');
}

/** Versão em texto puro do que está visível, para o botão Copiar. */
export function textoPlano(r: Resposta, visiveis: number | null): string {
  const orc = orcamentos(r, visiveis);
  const partes: string[] = [];
  r.blocos.forEach((b, i) => {
    const disponivel = orc[i] ?? 0;
    if (disponivel <= 0) return;
    switch (b.tipo) {
      case 'paragrafo':
        partes.push(textoSimples(b.texto, disponivel));
        break;
      case 'topicos': {
        let resto = disponivel - (b.titulo ? 1 : 0);
        const linhas = b.titulo ? [b.titulo] : [];
        for (const item of b.itens) {
          if (resto <= 0) break;
          linhas.push(`- ${textoSimples(item, resto)}`);
          resto -= palavras(item).length;
        }
        partes.push(linhas.join('\n'));
        break;
      }
      case 'tabela':
        partes.push(
          [b.titulo, b.colunas.join(' | '), ...b.linhas.map((l) => l.join(' | '))].join('\n'),
        );
        break;
      case 'barras':
        partes.push(
          [
            b.titulo,
            ...b.itens.map(
              (it) => `${it.rotulo}: ${it.valorTexto} (${b.cabecalho[2]}: ${it.detalhe})`,
            ),
          ].join('\n'),
        );
        break;
      case 'indicadores':
        partes.push(
          [b.titulo, ...b.itens.map((it) => `${it.rotulo}: ${it.valor} (${it.detalhe})`)].join(
            '\n',
          ),
        );
        break;
      case 'leads':
        partes.push(
          [
            b.titulo,
            ...b.itens.map((l) => `- ${l.nome}, ${l.interesse}. ${l.etapa}. ${l.semRetorno}.`),
          ].join('\n'),
        );
        break;
      case 'confirmacao':
        partes.push(
          [b.pergunta, ...b.itens.map((it) => `- ${it.nome}, ${it.interesse}. ${it.venceu}.`)].join(
            '\n',
          ),
        );
        break;
      default:
        break;
    }
  });
  return partes.join('\n\n');
}

// ─── Dados de demonstração ──────────────────────────────────────────────────

const RAMPA_ETAPAS: Record<string, string> = {
  'Novo lead': '#2F379A',
  'Em atendimento': '#4F5BD5',
  'Qualificação concluída': '#6670DC',
  'Aguardando cotação': '#7E87E3',
  'Proposta enviada': '#979EEA',
  'Em negociação': '#B1B6F0',
  'Contratação em andamento': '#C9CDF5',
  'Venda confirmada': '#0F7A40',
  Perdido: '#9CA3AF',
};

export function corEtapa(etapa: string): string {
  return RAMPA_ETAPAS[etapa] ?? '#9CA3AF';
}

const FUNIL_SEMANA: Bloco = {
  tipo: 'tabela',
  titulo: 'Funil dos últimos 7 dias',
  legenda: 'Conversão para a etapa seguinte',
  colunas: ['Etapa', 'Oportunidades', 'Conversão'],
  linhas: [
    ['Novo lead', '214', '78%'],
    ['Em atendimento', '167', '64%'],
    ['Qualificação concluída', '107', '71%'],
    ['Aguardando cotação', '76', '82%'],
    ['Proposta enviada', '62', '55%'],
    ['Em negociação', '34', '68%'],
    ['Venda confirmada', '23', '—'],
  ],
  marcadores: [
    corEtapa('Novo lead'),
    corEtapa('Em atendimento'),
    corEtapa('Qualificação concluída'),
    corEtapa('Aguardando cotação'),
    corEtapa('Proposta enviada'),
    corEtapa('Em negociação'),
    corEtapa('Venda confirmada'),
  ],
  destaque: 4,
};

const LEADS_POR_ORIGEM: Bloco = {
  tipo: 'barras',
  titulo: 'Leads por origem',
  legenda: 'Últimos 7 dias',
  cabecalho: ['Origem', 'Leads', 'Fecham'],
  tom: 'sinal',
  itens: [
    { rotulo: 'WhatsApp orgânico', valor: 96, valorTexto: '96', detalhe: '11,5%' },
    { rotulo: 'Site', valor: 54, valorTexto: '54', detalhe: '7,4%' },
    { rotulo: 'Campanha', valor: 41, valorTexto: '41', detalhe: '4,9%' },
    { rotulo: 'Indicação', valor: 23, valorTexto: '23', detalhe: '26,1%', destaque: true },
  ],
};

const ACOES_RELATORIO: Bloco = {
  tipo: 'acoes',
  itens: [
    { rotulo: 'Abrir no funil', icone: Columns3, href: '/funil' },
    {
      rotulo: 'Exportar PDF',
      icone: FileDown,
      recurso: 'Exportar PDF',
      detalhe:
        'Na próxima fase, o assistente gera o relatório em PDF com os dados reais da operação, pronto para enviar à equipe.',
    },
  ],
};

export function relatorio(foco: 'semana' | 'origem'): Resposta {
  if (foco === 'origem') {
    return {
      blocos: [
        {
          tipo: 'paragrafo',
          texto:
            '**Indicação** é a origem que mais fecha: 26,1% dos leads indicados viraram venda nos últimos 7 dias. O WhatsApp orgânico traz o maior volume, com 96 leads e 11 vendas.',
        },
        LEADS_POR_ORIGEM,
        FUNIL_SEMANA,
        {
          tipo: 'topicos',
          titulo: 'Leitura por origem',
          itens: [
            'Indicação converte mais que o dobro do WhatsApp orgânico. Pedir indicação logo depois da implantação tende a render mais vendas do que aumentar a campanha.',
            '**Campanha** traz volume, mas fecha só 4,9%. A maior parte desses leads para em Qualificação concluída, antes de pedir cotação.',
            'Os leads do site chegam com a necessidade já informada, o que deixa a primeira resposta da IA mais rápida e a cotação mais precisa.',
          ],
        },
        ACOES_RELATORIO,
      ],
    };
  }
  return {
    blocos: [
      {
        tipo: 'paragrafo',
        texto:
          'Nos últimos 7 dias, a operação fechou **23 vendas** a partir de **318 conversas**, uma conversão de **7,2%**. É 1,1 ponto acima da semana anterior, com destaque para as indicações.',
      },
      FUNIL_SEMANA,
      LEADS_POR_ORIGEM,
      {
        tipo: 'topicos',
        titulo: 'O que chama a atenção',
        itens: [
          '**Indicação** fecha 26,1% dos leads, mais que o dobro do WhatsApp orgânico, mesmo com o menor volume.',
          '**Proposta enviada** é onde o funil mais perde: só 55% seguem para negociação. 9 propostas estão sem retorno há mais de 48 horas.',
          'A IA respondeu 94% das conversas em menos de 1 minuto e participou de 15 das 23 vendas.',
        ],
      },
      ACOES_RELATORIO,
    ],
  };
}

export function leadsParados(): Resposta {
  return {
    blocos: [
      {
        tipo: 'paragrafo',
        texto:
          'Encontrei **4 leads** sem retorno há mais de 3 dias. Dois deles já estão com proposta em mãos, então vale começar por eles.',
      },
      {
        tipo: 'leads',
        titulo: 'Sem retorno há mais de 3 dias',
        legenda: 'Ordenados pela etapa mais avançada',
        itens: [
          {
            nome: 'Carlos Eduardo',
            interesse: 'Plano Completo, família de 4 pessoas',
            tipoInteresse: 'pessoa',
            etapa: 'Proposta enviada',
            semRetorno: 'Sem retorno há 4 dias',
          },
          {
            nome: 'Juliana Costa',
            interesse: 'Soluções para Empresas, equipe de 15 pessoas',
            tipoInteresse: 'empresa',
            etapa: 'Em negociação',
            semRetorno: 'Sem retorno há 6 dias',
          },
          {
            nome: 'Mariana Oliveira',
            interesse: 'Projeto de implantação em 2 unidades',
            tipoInteresse: 'projeto',
            etapa: 'Aguardando cotação',
            semRetorno: 'Sem retorno há 5 dias',
          },
          {
            nome: 'Lucas Ferreira',
            interesse: 'Plano Essencial, uso individual',
            tipoInteresse: 'pessoa',
            etapa: 'Aguardando cotação',
            semRetorno: 'Sem retorno há 8 dias',
          },
        ],
      },
      { tipo: 'paragrafo', texto: 'Quer que eu prepare uma mensagem de retomada para eles?' },
    ],
  };
}

export function ajustarFunil(): Resposta {
  return {
    blocos: [
      {
        tipo: 'paragrafo',
        texto:
          'Verifiquei o prazo da próxima ação em todas as etapas do funil. Os atrasos estão concentrados em uma etapa só.',
      },
      {
        tipo: 'confirmacao',
        pergunta: 'Encontrei 7 oportunidades vencidas em Aguardando cotação. Mover para revisão?',
        itens: [
          { nome: 'Rafael Santos', interesse: 'Plano Essencial', venceu: 'Venceu há 2 dias' },
          { nome: 'Fernanda Lima', interesse: 'Plano Completo', venceu: 'Venceu há 3 dias' },
          { nome: 'Bruno Carvalho', interesse: 'Soluções para Empresas', venceu: 'Venceu há 3 dias' },
          {
            nome: 'Patrícia Menezes',
            interesse: 'Plano Completo, 3 pessoas',
            venceu: 'Venceu há 4 dias',
          },
          { nome: 'Diego Rocha', interesse: 'Soluções para Empresas', venceu: 'Venceu há 5 dias' },
          { nome: 'Aline Souza', interesse: 'Plano Essencial', venceu: 'Venceu há 6 dias' },
          { nome: 'Thiago Nunes', interesse: 'Plano Completo, 2 unidades', venceu: 'Venceu há 9 dias' },
        ],
        recurso: 'Mover oportunidades pelo assistente',
        detalhe:
          'Nesta prévia, nada muda no funil. Na próxima fase, o assistente move as oportunidades depois da sua confirmação e registra a mudança no histórico de ações.',
      },
    ],
  };
}

export function desempenhoIa(p: { periodo: string; comparacao: string }): Resposta {
  return {
    blocos: [
      {
        tipo: 'paragrafo',
        texto: `Resumo do agente de IA ${p.periodo}: ele conduziu sozinho a maior parte dos atendimentos e só transferiu para a equipe quando o cliente pediu ou quando a cotação exigia análise.`,
      },
      {
        tipo: 'indicadores',
        titulo: 'Atendimento da IA',
        legenda: p.periodo.charAt(0).toUpperCase() + p.periodo.slice(1),
        itens: [
          {
            rotulo: 'Conversas atendidas',
            valor: '1.284',
            detalhe: `12% a mais que ${p.comparacao}`,
          },
          { rotulo: 'Transferências para humanos', valor: '167', detalhe: '13% das conversas' },
          {
            rotulo: 'Primeira resposta, em média',
            valor: '38 s',
            detalhe: '94% em menos de 1 minuto',
          },
          { rotulo: 'Conduzidas só pela IA', valor: '87%', detalhe: 'Sem precisar de atendente' },
        ],
      },
      {
        tipo: 'barras',
        titulo: 'Principais objeções',
        legenda: 'As 3 mais citadas pelos clientes',
        cabecalho: ['Objeção', 'Conversas', 'Participação'],
        tom: 'neutro',
        itens: [
          {
            rotulo: 'Preço da mensalidade',
            valor: 214,
            valorTexto: '214',
            detalhe: '38%',
            destaque: true,
          },
          {
            rotulo: 'Fidelidade e multa de cancelamento',
            valor: 131,
            valorTexto: '131',
            detalhe: '23%',
          },
          { rotulo: 'Prazo de implantação', valor: 96, valorTexto: '96', detalhe: '17%' },
        ],
      },
      {
        tipo: 'paragrafo',
        texto:
          '**Sugestão:** incluir no material aprovado do agente uma comparação do valor do plano por dia. Nas conversas em que a IA usou esse argumento, a objeção de preço caiu pela metade.',
      },
      { tipo: 'acoes', itens: [{ rotulo: 'Ajustar o agente de IA', icone: Bot, href: '/agente' }] },
    ],
  };
}

const CAPACIDADES: Bloco = {
  tipo: 'topicos',
  itens: [
    '**Gerar relatórios** de vendas e de conversão por etapa e por origem, em qualquer período.',
    '**Encontrar leads** parados, sem retorno ou com proposta perto de vencer.',
    '**Ajustar o funil**, movendo oportunidades em lote sempre com a sua confirmação.',
    '**Configurar automações** de acompanhamento e mensagens de retomada.',
    '**Responder dúvidas sobre a operação**, como regras de transferência e o que a IA fez em cada conversa.',
  ],
};

const SUGESTOES_SEGUINTES: Bloco = {
  tipo: 'sugestoes',
  titulo: 'Experimente perguntar',
  itens: [
    'Me mostre o resumo da semana',
    'Quais leads estão sem resposta?',
    'Como a IA se saiu nos últimos 30 dias?',
  ],
};

export function ajuda(motivo: 'desconhecida' | 'capacidades'): Resposta {
  return {
    blocos: [
      {
        tipo: 'paragrafo',
        texto:
          motivo === 'capacidades'
            ? 'Posso ajudar a acompanhar e ajustar a operação comercial. Quando estiver conectado aos dados, vou poder:'
            : 'Ainda não tenho uma resposta para isso nesta prévia. Quando estiver conectado aos dados da operação, vou poder:',
      },
      CAPACIDADES,
      SUGESTOES_SEGUINTES,
    ],
  };
}

// ─── Escolha da resposta pelo texto ─────────────────────────────────────────

const PERIODO_30_DIAS = { periodo: 'nos últimos 30 dias', comparacao: 'os 30 dias anteriores' };

export function escolherResposta(mensagem: string): { resposta: Resposta; status: string } {
  const t = normalizar(mensagem);
  if (/\b(ia|agente|agentes)\b/.test(t)) {
    return { resposta: desempenhoIa(PERIODO_30_DIAS), status: 'Analisando as conversas da IA…' };
  }
  if (/\b(relatorio|relatorios|resumo|resumir|semana|semanal)\b/.test(t)) {
    return /\b(origem|origens)\b/.test(t)
      ? { resposta: relatorio('origem'), status: 'Cruzando origens e vendas…' }
      : { resposta: relatorio('semana'), status: 'Consultando o funil…' };
  }
  if (/\b(parado|parados|parada|paradas|sem resposta|sem retorno|lead|leads)\b/.test(t)) {
    return { resposta: leadsParados(), status: 'Procurando leads sem retorno…' };
  }
  if (/\b(funil|mover|mova|move|etapa|etapas)\b/.test(t)) {
    return { resposta: ajustarFunil(), status: 'Verificando prazos no funil…' };
  }
  if (/\b(o que (voce|vc) (pode|consegue|sabe)|ajuda|ajudar)\b/.test(t)) {
    return { resposta: ajuda('capacidades'), status: 'Pensando…' };
  }
  return { resposta: ajuda('desconhecida'), status: 'Pensando…' };
}

/** Título da conversa a partir da primeira mensagem. */
export function tituloDaMensagem(texto: string): string {
  const limpo = texto
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[?.!:;,]+$/, '');
  const curto = limpo.length > 42 ? `${limpo.slice(0, 41).trimEnd()}…` : limpo;
  return curto.charAt(0).toUpperCase() + curto.slice(1);
}

// ─── Estado vazio e histórico ───────────────────────────────────────────────

export const SUGESTOES_INICIAIS: {
  titulo: string;
  descricao: string;
  icone: LucideIcon;
  mensagem: string;
}[] = [
  {
    titulo: 'Resumo da semana',
    descricao: 'Vendas, conversas e conversão dos últimos 7 dias',
    icone: ChartColumn,
    mensagem: 'Me mostre o resumo da semana: vendas, conversas e conversão dos últimos 7 dias.',
  },
  {
    titulo: 'Leads parados',
    descricao: 'Quem está sem resposta há mais de 3 dias',
    icone: Hourglass,
    mensagem: 'Quais leads estão sem resposta há mais de 3 dias?',
  },
  {
    titulo: 'Relatório por origem',
    descricao: 'De onde vêm os leads que mais fecham',
    icone: ChartPie,
    mensagem: 'Gere um relatório por origem: de onde vêm os leads que mais fecham?',
  },
  {
    titulo: 'Ajustar o funil',
    descricao: 'Mover oportunidades vencidas para revisão',
    icone: Columns3,
    mensagem: 'Ajuste o funil: mova as oportunidades vencidas para revisão.',
  },
];

export const GRUPOS_HISTORICO: { id: GrupoHistorico; rotulo: string }[] = [
  { id: 'hoje', rotulo: 'Hoje' },
  { id: 'ontem', rotulo: 'Ontem' },
  { id: 'semana', rotulo: 'Últimos 7 dias' },
];

function conversaRoteirizada(
  id: string,
  titulo: string,
  grupo: GrupoHistorico,
  pergunta: string,
  resposta: Resposta,
): Conversa {
  return {
    id,
    titulo,
    grupo,
    mensagens: [
      { id: `${id}-p`, autor: 'usuario', texto: pergunta },
      { id: `${id}-r`, autor: 'assistente', resposta },
    ],
  };
}

export const CONVERSAS_INICIAIS: Conversa[] = [
  conversaRoteirizada(
    'semana',
    'Resumo de vendas da semana',
    'hoje',
    'Me dá um resumo das vendas da semana.',
    relatorio('semana'),
  ),
  conversaRoteirizada(
    'parados',
    'Leads parados em cotação',
    'hoje',
    'Quais leads estão parados há mais de 3 dias?',
    leadsParados(),
  ),
  conversaRoteirizada(
    'origem',
    'Relatório de conversão por origem',
    'ontem',
    'Quero um relatório de conversão por origem.',
    relatorio('origem'),
  ),
  conversaRoteirizada(
    'vencidas',
    'Oportunidades vencidas no funil',
    'ontem',
    'Tem oportunidade vencida no funil? Quero mover para revisão.',
    ajustarFunil(),
  ),
  conversaRoteirizada(
    'ia-outubro',
    'Desempenho da IA em outubro',
    'semana',
    'Como a IA se saiu em outubro?',
    desempenhoIa({ periodo: 'em outubro', comparacao: 'setembro' }),
  ),
  conversaRoteirizada(
    'capacidades',
    'O que o assistente consegue fazer',
    'semana',
    'O que você consegue fazer por mim?',
    ajuda('capacidades'),
  ),
];
