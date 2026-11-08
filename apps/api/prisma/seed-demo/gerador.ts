import type { Prisma, PrismaClient } from '@prisma/client';
import { ETAPAS, podeMover, type Etapa, type TipoAtor } from '@sales-hub/shared';
import { criarPrng, type Prng } from './prng';
import { curtos, EMPRESA, PRODUTOS, PRODUTOS_COM_ARTIGO, ROTEIROS, type Ctx, type Passo, type RoteiroId, type SlugProduto } from './roteiros';

/**
 * Base fictícia determinística de 90 dias para a demo. Sem Math.random / Date.now / new Date() sem argumentos:
 * tudo vem do PRNG (mulberry32) e de `agora`. Inserções em lote (createMany) com ids pré-calculados.
 */
type Db = PrismaClient | Prisma.TransactionClient;

export type ResultadoDemo = {
  contatos: number;
  oportunidades: number;
  conversas: number;
  mensagens: number;
  turnos: number;
  acoes: number;
  eventos: number;
  objecoes: number;
  tarefas: number;
  resumos: number;
};

export const SEMENTE_PADRAO = 20261111;
const AGORA_PADRAO = new Date('2026-11-11T18:00:00.000Z');
const DAY = 86_400_000;
const HORA = 3_600_000;
const MIN = 60_000;
const MODELO_IA = 'claude-opus-5-5';

/** Apaga tudo que é demo (seed e ao_vivo). Filhos vão por cascata. Preserva usuários, setores, números, catálogo e config. */
export async function apagarBaseDemo(db: Db): Promise<void> {
  await apagarOrigens(db, ['seed', 'ao_vivo']);
}

async function apagarOrigens(db: Db, origens: Array<'seed' | 'ao_vivo'>): Promise<void> {
  const where = { origemDemo: { in: origens } };
  await db.task.deleteMany({ where });
  await db.conversation.deleteMany({ where });
  await db.opportunity.deleteMany({ where });
  await db.contact.deleteMany({ where });
}

const PRIMEIROS = ['Marcos', 'Ana', 'João', 'Maria', 'Carlos', 'Fernanda', 'Rafael', 'Juliana', 'Paulo', 'Camila', 'Lucas', 'Patrícia', 'Anderson', 'Luciana', 'Diego', 'Aline', 'Roberto', 'Vanessa', 'Fábio', 'Tatiane', 'Edson', 'Renata', 'Gustavo', 'Simone', 'Wesley', 'Bruna', 'Josué', 'Elaine', 'Cleber', 'Priscila', 'Alisson', 'Mônica', 'Jonas', 'Daniele', 'Ricardo', 'Cláudia', 'Thiago', 'Sandra', 'Everton', 'Adriana', 'Messias', 'Rosana', 'Valdir', 'Karina', 'Emerson', 'Letícia', 'Nelson', 'Gleice', 'Osmar', 'Jaqueline', 'Ivan', 'Beatriz', 'Wellington', 'Silvana', 'Davi', 'Larissa', 'Raimundo', 'Francisca', 'Sebastião', 'Eliane'];
const SOBRENOMES = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Lima', 'Ferreira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Carvalho', 'Araújo', 'Ribeiro', 'Gomes', 'Martins', 'Barbosa', 'Moreira', 'Cardoso', 'Teixeira', 'Rocha', 'Dias', 'Monteiro', 'Mendes', 'Freitas', 'Pinto', 'Batista', 'Correia', 'Cavalcante', 'Nunes', 'Campos', 'Vieira', 'Machado', 'Azevedo', 'Fonseca', 'Lopes', 'Borges', 'Moraes', 'Cunha', 'Amaral'];
const EMPRESAS = ['Escritório Contábil Horizonte', 'Clínica Bem Viver', 'Distribuidora Ponto Certo', 'Construtora Alicerce', 'Agência Criativa Norte', 'Rede de Lojas Primavera'];
const CIDADES: Record<string, string[]> = {
  SP: ['São Paulo', 'Campinas', 'Ribeirão Preto', 'Santos', 'Sorocaba'],
  RJ: ['Rio de Janeiro', 'Niterói', 'Petrópolis'],
  MG: ['Belo Horizonte', 'Uberlândia', 'Juiz de Fora'],
  PR: ['Curitiba', 'Londrina', 'Maringá'],
  RS: ['Porto Alegre', 'Caxias do Sul'],
  BA: ['Salvador', 'Feira de Santana'],
  PE: ['Recife', 'Caruaru'],
  GO: ['Goiânia', 'Anápolis'],
  DF: ['Brasília'],
};
const PESOS_UF: Array<readonly [string, number]> = [['SP', 30], ['RJ', 14], ['MG', 14], ['PR', 10], ['RS', 8], ['BA', 8], ['PE', 6], ['GO', 5], ['DF', 5]];

/** Perfil do item de interesse. "empresa" é só do roteiro de empresa (equipe grande). */
type Perfil = 'individual' | 'casal' | 'familia' | 'negocio' | 'projeto' | 'empresa';
const PERFIS_PESSOAIS = ['individual', 'casal', 'familia'] as const;

// Distribuição por etapa: totais 220 = 180 principais + 40 secundárias (segundo interesse do mesmo contato).
const PRINCIPAIS: Record<Etapa, number> = { novo_lead: 33, em_atendimento: 24, qualificacao_concluida: 20, aguardando_cotacao: 14, proposta_enviada: 16, em_negociacao: 11, contratacao_em_andamento: 5, venda_confirmada: 31, perdido: 26 };
const SECUNDARIAS: Record<Etapa, number> = { novo_lead: 8, em_atendimento: 8, qualificacao_concluida: 6, aguardando_cotacao: 4, proposta_enviada: 4, em_negociacao: 2, contratacao_em_andamento: 0, venda_confirmada: 4, perdido: 4 };
// Idade (dias atrás) em que a oportunidade foi criada, por etapa final.
const IDADE: Record<Etapa, [number, number]> = {
  novo_lead: [0.1, 6], em_atendimento: [0.5, 14], qualificacao_concluida: [1, 25], aguardando_cotacao: [2, 30], proposta_enviada: [4, 40],
  em_negociacao: [8, 55], contratacao_em_andamento: [3, 20], venda_confirmada: [8, 89], perdido: [10, 89],
};
const MOTIVOS: Array<[string, number]> = [['Preço', 12], ['Fechou com concorrente', 6], ['Sem interesse no momento', 5], ['Sem retorno do cliente', 4], ['Desistiu do projeto', 3]];
const MOTIVO_OBJECAO: Record<string, 'preco' | 'concorrente' | 'momento' | 'outro'> = {
  'Preço': 'preco', 'Fechou com concorrente': 'concorrente', 'Sem interesse no momento': 'momento', 'Sem retorno do cliente': 'outro', 'Desistiu do projeto': 'outro',
};
const DESC_OBJECAO: Record<string, string[]> = {
  preco: ['Achou o valor acima do esperado.', 'Comparou com outra empresa e achou mais barato.'],
  confianca: ['Quer conhecer melhor a empresa antes de contratar.', 'Perguntou se a empresa atende presencialmente na cidade.'],
  necessidade: ['Não sabe se precisa do Plano Completo ou se o Essencial basta.', 'Acha que a solução atual ainda resolve.'],
  momento: ['Prefere decidir no mês que vem.', 'Está sem verba neste momento.'],
  concorrente: ['Já tem proposta de outra empresa.'],
  outro: ['Aguardando resposta de um familiar.'],
};
const PROXIMA_ACAO: Partial<Record<Etapa, string[]>> = {
  novo_lead: ['Responder primeiro contato', 'Entender o que o cliente procura'],
  em_atendimento: ['Concluir qualificação do interesse', 'Perguntar sobre a solução atual'],
  qualificacao_concluida: ['Pedir cotação ao time', 'Apresentar opções de plano'],
  aguardando_cotacao: ['Montar cotação do plano', 'Cobrar valor com o time'],
  proposta_enviada: ['Retornar sobre a proposta', 'Confirmar se recebeu a proposta'],
  em_negociacao: ['Negociar condições de pagamento', 'Ligar para fechar'],
  contratacao_em_andamento: ['Conferir documentos', 'Agendar implantação'],
};

type Rec = Record<string, unknown>;

interface EventoI {
  id: string; opportunityId: string; de: Etapa | null; para: Etapa; ator: TipoAtor; atorUsuarioId: string | null;
  justificativa: string; mensagemOrigemId: string | null; evidencia: Rec | null; criadoEm: number; anexado?: boolean;
}
interface OppI {
  id: string; contactIdx: number; itemId: string; principal: boolean; etapa: Etapa; eventos: EventoI[];
  responsavelId: string | null; criadaEm: number; motivoPerda: string | null; roteiro: RoteiroId | null; convId: string | null;
  row: Prisma.OpportunityCreateManyInput;
}

function jus(para: Etapa, ator: TipoAtor, rng: Prng, motivo?: string | null): string {
  if (ator === 'sistema' && para === 'novo_lead') return 'Primeiro contato recebido pelo WhatsApp.';
  const m: Record<Etapa, string[]> = {
    novo_lead: ['Oportunidade reaberta pelo sistema.'],
    em_atendimento: ['Cliente respondeu e a conversa está em andamento.', 'Conversa iniciada; coletando o que o cliente precisa.'],
    qualificacao_concluida: ['Perfil, necessidade e interesse coletados.', 'Qualificação concluída com os dados principais.'],
    aguardando_cotacao: ['Cotação do plano solicitada ao time.', 'Cliente quer um plano sob cotação; aguardando valores.'],
    proposta_enviada: ['Proposta enviada ao cliente.', 'Cotação pronta e proposta enviada.'],
    em_negociacao: ['Cliente pediu ajuste de condições.', 'Negociação iniciada após a proposta.'],
    contratacao_em_andamento: ['Cliente aceitou; documentos em conferência.', 'Cliente confirmou que quer contratar.'],
    venda_confirmada: ['Contrato assinado e pagamento confirmado.', 'Venda confirmada após implantação agendada.'],
    perdido: [motivo ? `Perdido: ${motivo.toLowerCase()}.` : 'Perdido.'],
  };
  return rng.pick(m[para]);
}

function atorPara(para: Etapa, rng: Prng, voltou: boolean): TipoAtor {
  if (voltou) return 'humano';
  switch (para) {
    case 'em_atendimento': case 'qualificacao_concluida': case 'aguardando_cotacao': return 'ia';
    case 'proposta_enviada': return rng.chance(0.5) ? 'sistema' : 'humano';
    case 'perdido': return rng.chance(0.4) ? 'ia' : 'humano';
    default: return 'humano';
  }
}

/** Sequência de etapas (começa em novo_lead) até o alvo, só com saltos que podeMover aceita. */
function caminho(alvo: Etapa, rng: Prng): Array<{ para: Etapa; voltou: boolean }> {
  const seq: Array<{ para: Etapa; voltou: boolean }> = [{ para: 'novo_lead', voltou: false }];
  const idx = (e: Etapa) => ETAPAS.indexOf(e);
  if (alvo === 'novo_lead') return seq;
  let parada: Etapa = alvo;
  if (alvo === 'perdido') {
    parada = rng.pesos<Etapa>([['novo_lead', 1], ['em_atendimento', 3], ['qualificacao_concluida', 2], ['aguardando_cotacao', 2], ['proposta_enviada', 4], ['em_negociacao', 3]]);
  }
  const ate = idx(parada);
  for (let i = 1; i < ate; i++) if (rng.chance(0.8)) seq.push({ para: ETAPAS[i]!, voltou: false });
  if (parada !== 'novo_lead') seq.push({ para: parada, voltou: false });
  // Recuo ocasional de uma etapa (feito por pessoa).
  if (idx(parada) >= 4 && alvo !== 'perdido' && rng.chance(0.08)) {
    seq.push({ para: ETAPAS[idx(parada) - 1]!, voltou: true }, { para: parada, voltou: false });
  }
  if (alvo === 'perdido') seq.push({ para: 'perdido', voltou: false });
  return seq;
}

export async function gerarBaseDemo(
  db: Db,
  opts: { semente?: number; agora?: Date } = {},
): Promise<ResultadoDemo> {
  const rng = criarPrng(opts.semente ?? SEMENTE_PADRAO);
  const agoraMs = (opts.agora ?? AGORA_PADRAO).getTime();
  const ts = (ms: number) => new Date(ms);

  await apagarOrigens(db, ['seed']); // idempotente: regenerar não duplica

  const usuarios = await db.user.findMany({ where: { email: { in: ['gestor@example.com', 'atendente1@example.com', 'atendente2@example.com'] } } });
  const porEmail = (e: string) => usuarios.find((u) => u.email === e);
  const gestor = porEmail('gestor@example.com');
  const ana = porEmail('atendente1@example.com');
  const bruno = porEmail('atendente2@example.com');
  if (!gestor || !ana || !bruno) throw new Error('Rode o seed base (db:seed) antes: faltam Gestor Comercial, Ana Ribeiro e Bruno Costa.');
  const resp = [gestor, ana, bruno];
  const atendentes = [ana, bruno];
  const setores = await db.sector.findMany();
  const setor = (nome: string) => setores.find((s) => s.nome === nome)?.id ?? null;
  // Setor que recebe emergências e implantações: "Suporte" se existir, senão o nome antigo do seed base.
  const SUPORTE = ['Suporte'].find((n) => setores.some((s) => s.nome === n)) ?? 'Suporte';
  const numero = await db.whatsAppNumber.findFirst({ where: { rotulo: 'Comercial' } });
  if (!numero) throw new Error('Número "Comercial" não encontrado. Rode o seed base.');

  // ---------- contatos ----------
  const N = 180;
  const telefones = new Set<string>();
  const nomesUsados = new Set<string>();
  interface ContatoI {
    id: string; nome: string; primeiro: string; e164: string; cidade: string; uf: string; origem: Prisma.ContactCreateManyInput['origem'];
    roteiro: RoteiroId | null; empresaGrande: boolean; empresa: string | null; opps: OppI[]; itens: ItemC[];
    emergencia: boolean;
  }
  interface ItemC { id: string; perfil: Perfil; categoria: string; descricao: string; quantidade: number | null; fala: string; produto: SlugProduto }
  const contatos: ContatoI[] = [];
  for (let i = 0; i < N; i++) {
    const uf = rng.pesos(PESOS_UF);
    let nome = '';
    let primeiro = '';
    do {
      primeiro = rng.pick(PRIMEIROS);
      nome = `${primeiro} ${rng.pick(SOBRENOMES)} ${rng.pick(SOBRENOMES)}`;
    } while (nomesUsados.has(nome));
    nomesUsados.add(nome);
    let e164 = '';
    do e164 = `+55009${rng.int(10_000_000, 99_999_999)}`; while (telefones.has(e164));
    telefones.add(e164);
    contatos.push({
      id: `demo_c_${i + 1}`, nome, primeiro, e164, uf, cidade: rng.pick(CIDADES[uf]!),
      origem: rng.pesos<Prisma.ContactCreateManyInput['origem']>([['whatsapp_organico', 45], ['site', 20], ['campanha', 20], ['indicacao', 10], ['importacao', 5]]),
      roteiro: null, empresaGrande: false, empresa: null, opps: [], itens: [], emergencia: false,
    });
  }

  // ---------- etapas principais e roteiros ----------
  const listaPrincipal: Etapa[] = [];
  for (const e of ETAPAS) for (let k = 0; k < PRINCIPAIS[e]; k++) listaPrincipal.push(e);
  const etapaPrincipal = rng.shuffle(listaPrincipal);
  const livres = new Set<number>(contatos.map((_, i) => i));
  const tomar = (n: number, pred: (e: Etapa) => boolean, roteiro: RoteiroId) => {
    const cand = rng.shuffle([...livres].filter((i) => pred(etapaPrincipal[i]!)));
    const resto = rng.shuffle([...livres].filter((i) => !pred(etapaPrincipal[i]!)));
    for (const i of [...cand, ...resto].slice(0, n)) {
      livres.delete(i);
      contatos[i]!.roteiro = roteiro;
    }
  };
  const em = (...es: Etapa[]) => (e: Etapa) => es.includes(e);
  tomar(1, em('venda_confirmada'), 'emergencia');
  tomar(5, em('contratacao_em_andamento'), 'intencao_contratar');
  tomar(3, em('em_negociacao'), 'intencao_contratar');
  tomar(2, em('venda_confirmada'), 'intencao_contratar');
  tomar(3, em('perdido'), 'interrupcao');
  tomar(4, em('perdido'), 'objecao_preco');
  tomar(6, em('proposta_enviada', 'em_negociacao'), 'objecao_preco');
  tomar(6, em('em_atendimento', 'qualificacao_concluida', 'aguardando_cotacao', 'proposta_enviada', 'em_negociacao'), 'empresa');
  tomar(8, em('aguardando_cotacao', 'proposta_enviada', 'qualificacao_concluida'), 'transferencia');
  tomar(10, em('proposta_enviada', 'em_negociacao', 'venda_confirmada'), 'atendimento_humano');
  tomar(12, em('novo_lead', 'em_atendimento', 'qualificacao_concluida', 'aguardando_cotacao'), 'qualificacao');
  contatos.forEach((c) => (c.emergencia = c.roteiro === 'emergencia'));
  let fi = 0;
  for (const c of contatos) {
    if (c.roteiro === 'empresa') {
      c.empresaGrande = true;
      c.empresa = EMPRESAS[fi++]!;
      c.nome = c.empresa;
      c.primeiro = '';
    }
  }

  // ---------- itens de interesse ----------
  const itens: Prisma.InterestItemCreateManyInput[] = [];
  let iSeq = 0;
  const novoItem = (c: ContatoI, forcar?: Perfil): string => {
    const perfil = forcar ?? rng.pesos<Perfil>([['individual', 30], ['casal', 15], ['familia', 30], ['negocio', 18], ['projeto', 7]]);
    const id = `demo_i_${++iSeq}`;
    let categoria: string;
    let descricao: string;
    let quantidade: number | null;
    let fala: string;
    switch (perfil) {
      case 'individual': categoria = 'Uso pessoal'; descricao = '1 pessoa'; quantidade = 1; fala = 'É só pra mim mesmo'; break;
      case 'casal': categoria = 'Plano residencial'; descricao = '2 pessoas'; quantidade = 2; fala = 'Somos eu e mais uma pessoa em casa'; break;
      case 'familia': quantidade = rng.int(3, 6); categoria = 'Plano residencial'; descricao = `família de ${quantidade} pessoas`; fala = `É pra família toda, somos ${quantidade}`; break;
      case 'negocio': quantidade = rng.int(2, 8); categoria = 'Empresa pequena'; descricao = `escritório com ${quantidade} pessoas`; fala = `É pro meu escritório, somos ${quantidade}`; break;
      case 'projeto': categoria = 'Projeto'; descricao = 'implantação pontual'; quantidade = null; fala = 'É pra um projeto pontual que vou tocar'; break;
      case 'empresa': quantidade = rng.int(15, 60); categoria = 'Empresa'; descricao = `equipe de ${quantidade} pessoas`; fala = `Somos ${quantidade} pessoas na equipe`; break;
    }
    const produto: SlugProduto =
      perfil === 'empresa' ? 'solucoes-empresas'
        : perfil === 'negocio' || perfil === 'projeto' ? rng.pesos<SlugProduto>([['plano-completo', 1], ['solucoes-empresas', 1]])
          : rng.pesos<SlugProduto>([['plano-essencial', 45], ['plano-completo', 55]]);
    itens.push({ id, contactId: c.id, categoria, descricao, quantidade, camposIa: {}, createdAt: ts(agoraMs - rng.int(1, 80) * DAY) });
    c.itens.push({ id, perfil, categoria, descricao, quantidade, fala, produto });
    return id;
  };
  contatos.forEach((c) => novoItem(c, c.empresaGrande ? 'empresa' : c.roteiro === 'qualificacao' ? rng.pick(PERFIS_PESSOAIS) : undefined));
  // Roteiros que falam de um plano específico fixam o produto da oportunidade principal.
  const PRODUTO_ROTEIRO: Partial<Record<RoteiroId, SlugProduto>> = { qualificacao: 'plano-completo', objecao_preco: 'plano-completo', atendimento_humano: 'plano-completo' };

  // ---------- oportunidades ----------
  const motivosLista = rng.shuffle(MOTIVOS.flatMap(([m, n]) => Array<string>(n).fill(m)));
  const tirarMotivo = (preferir?: string): string => {
    const i = preferir ? motivosLista.indexOf(preferir) : -1;
    return motivosLista.splice(i >= 0 ? i : 0, 1)[0] ?? 'Sem retorno do cliente';
  };
  const oportunidades: OppI[] = [];
  let oSeq = 0;
  let eSeq = 0;
  const criarOpp = (c: ContatoI, ci: number, etapa: Etapa, principal: boolean, itemId: string) => {
    const [dmin, dmax] = IDADE[etapa];
    let criada = Math.round(agoraMs - rng.entre(dmin, dmax) * DAY);
    criada = Math.min(criada, agoraMs - 2 * HORA);
    const id = `demo_o_${++oSeq}`;
    const passos = caminho(etapa, rng);
    const avail = agoraMs - 5 * MIN - criada;
    const fracs = Array.from({ length: passos.length - 1 }, () => rng.entre(0.03, 0.95)).sort((a, b) => a - b);
    const roteiro = principal ? c.roteiro : null;
    let motivo: string | null = null;
    if (etapa === 'perdido') motivo = roteiro === 'interrupcao' ? tirarMotivo('Sem interesse no momento') : roteiro === 'objecao_preco' ? tirarMotivo('Preço') : tirarMotivo();
    const temResp = ETAPAS.indexOf(etapa) >= 4 || rng.chance(0.3);
    const responsavelId = temResp ? rng.pick(resp).id : null;
    const eventos: EventoI[] = [];
    let anterior: Etapa | null = null;
    let tAnt = criada;
    passos.forEach((p, i) => {
      let ator: TipoAtor = i === 0 ? 'sistema' : atorPara(p.para, rng, p.voltou);
      if (ator === 'humano' && !responsavelId) ator = 'sistema';
      if (anterior) {
        // Garante a regra do funil com o ator escolhido.
        let r = podeMover(anterior, p.para, ator);
        if (!r.ok && ator !== 'humano' && responsavelId) {
          ator = 'humano';
          r = podeMover(anterior, p.para, ator);
        }
        if (!r.ok) throw new Error(`Salto inválido ${anterior} -> ${p.para} (${ator}): ${r.motivo}`);
      }
      const t = i === 0 ? criada : Math.max(tAnt + MIN, Math.round(criada + fracs[i - 1]! * avail));
      tAnt = t;
      eventos.push({
        id: `demo_e_${++eSeq}`, opportunityId: id, de: anterior, para: p.para, ator,
        atorUsuarioId: ator === 'humano' ? responsavelId : null,
        justificativa: jus(p.para, ator, rng, motivo), mensagemOrigemId: null,
        evidencia: p.para === 'venda_confirmada' ? { tipo: 'contrato_assinado', referencia: `CT-${rng.int(10000, 99999)}` } : null,
        criadoEm: t,
      });
      anterior = p.para;
    });
    const item = c.itens.find((x) => x.id === itemId)!;
    const produto: SlugProduto = (roteiro ? PRODUTO_ROTEIRO[roteiro] : undefined) ?? item.produto;
    const qualificada = ETAPAS.indexOf(etapa) >= 2 && etapa !== 'perdido';
    const aberta = !['venda_confirmada', 'perdido'].includes(etapa);
    const prox = PROXIMA_ACAO[etapa];
    const o: OppI = {
      id, contactIdx: ci, itemId, principal, etapa, eventos, responsavelId, criadaEm: criada, motivoPerda: motivo, roteiro, convId: null,
      row: {
        id, contactId: c.id, itemId, produto, etapa, etapaDesde: ts(criada), responsavelId,
        solucaoAtual: qualificada ? rng.pesos<string | null>([['Nenhuma', 5], ['Planilha ou controle manual', 2], ['Serviço de outra empresa', 3]]) : null,
        momentoCompra: qualificada ? rng.pick(['Agora', 'Neste mês', 'Próximos 3 meses']) : null,
        preocupacao: qualificada ? rng.pesos<'preco' | 'qualidade' | 'prazo' | 'suporte' | 'outra'>([['qualidade', 3], ['preco', 3], ['suporte', 3], ['prazo', 2], ['outra', 1]]) : null,
        prazoDecisao: qualificada ? rng.pick(['Esta semana', 'Até o fim do mês', 'Sem pressa']) : null,
        motivoPerda: motivo,
        proximaAcao: aberta && prox ? rng.pick(prox) : null,
        proximaAcaoEm: aberta ? ts(agoraMs + rng.int(-3 * 24, 3 * 24) * HORA) : null,
        prioridade: etapa === 'contratacao_em_andamento' || (aberta && rng.chance(0.08)) ? 'alta' : 'normal',
        camposIa: {}, origemDemo: 'seed', criadaEm: ts(criada),
      },
    };
    c.opps.push(o);
    oportunidades.push(o);
  };
  contatos.forEach((c, i) => criarOpp(c, i, etapaPrincipal[i]!, true, c.itens[0]!.id));
  const listaSec: Etapa[] = [];
  for (const e of ETAPAS) for (let k = 0; k < SECUNDARIAS[e]; k++) listaSec.push(e);
  const etapaSec = rng.shuffle(listaSec);
  const comSegundo = rng.shuffle(contatos.map((_, i) => i).filter((i) => !contatos[i]!.empresaGrande && !contatos[i]!.emergencia)).slice(0, etapaSec.length);
  comSegundo.forEach((ci, k) => {
    const c = contatos[ci]!;
    criarOpp(c, ci, etapaSec[k]!, false, novoItem(c));
  });

  // ---------- conversas e mensagens ----------
  const conversas: Prisma.ConversationCreateManyInput[] = [];
  const mensagens: Prisma.MessageCreateManyInput[] = [];
  const turnos: Prisma.AgentTurnCreateManyInput[] = [];
  const acoes: Prisma.AgentActionCreateManyInput[] = [];
  const resumos: Prisma.ConversationSummaryCreateManyInput[] = [];
  const consentimentos: Prisma.ConsentCreateManyInput[] = [];
  const tarefas: Prisma.TaskCreateManyInput[] = [];
  const objecoes: Prisma.ObjectionCreateManyInput[] = [];
  let mSeq = 0;
  let tSeq = 0;
  let aSeq = 0;
  let sSeq = 0;
  let kSeq = 0;
  let cvSeq = 0;

  const grupo = (e: Etapa): 'topo' | 'meio' | 'fundo' | 'ganho' | 'perdido' =>
    e === 'venda_confirmada' ? 'ganho' : e === 'perdido' ? 'perdido' : e === 'contratacao_em_andamento' ? 'fundo' : e === 'proposta_enviada' || e === 'em_negociacao' ? 'meio' : 'topo';

  const contadores = { pausadas: 0, humanos: 0, aguardando: 0 };
  contatos.forEach((c) => {
    const op = c.opps[0]!;
    const fechada = op.etapa === 'venda_confirmada' || op.etapa === 'perdido';
    const cheia = c.roteiro !== null;
    const cvId = `demo_cv_${++cvSeq}`;
    op.convId = cvId;
    // estado da conversa
    let estado: Prisma.ConversationCreateManyInput['estado'] = 'IA_ATIVA';
    let prioridade: 'normal' | 'alta' | 'emergencia' = 'normal';
    let setorId = setor('Comercial');
    let curtoModo: 'normal' | 'pausada' | 'humano' | 'aguardando' = 'normal';
    if (c.roteiro === 'emergencia') {
      estado = 'AGUARDANDO_ESPECIALISTA'; prioridade = 'emergencia'; setorId = setor(SUPORTE);
    } else if (c.roteiro === 'interrupcao') estado = 'ENCERRADA';
    else if (fechada) estado = 'ENCERRADA';
    else if (c.roteiro === 'transferencia') estado = kSeq++ % 3 === 0 ? 'HUMANO' : 'AGUARDANDO_ESPECIALISTA';
    else if (c.roteiro === 'atendimento_humano' || c.roteiro === 'intencao_contratar') estado = 'HUMANO';
    else if (!cheia) {
      if (op.etapa === 'aguardando_cotacao' && contadores.aguardando < 4) { contadores.aguardando++; estado = 'AGUARDANDO_ESPECIALISTA'; curtoModo = 'aguardando'; }
      else if (['proposta_enviada', 'em_negociacao', 'contratacao_em_andamento'].includes(op.etapa) && contadores.humanos < 16) { contadores.humanos++; estado = 'HUMANO'; curtoModo = 'humano'; }
      else if (contadores.pausadas < 6 && ['novo_lead', 'em_atendimento', 'qualificacao_concluida'].includes(op.etapa)) { contadores.pausadas++; estado = 'IA_PAUSADA'; curtoModo = 'pausada'; }
    } else if (c.roteiro === 'objecao_preco' && contadores.pausadas < 6 && !fechada && kSeq++ % 2 === 0) { contadores.pausadas++; estado = 'IA_PAUSADA'; }

    // Todo atendente que aparece numa conversa é um usuário real; em HUMANO ele é o responsável da conversa.
    const atendenteU = resp.find((u) => u.id === op.responsavelId && u !== gestor) ?? rng.pick(atendentes);
    const semResponsavel = estado === 'AGUARDANDO_ESPECIALISTA';
    if ((estado === 'HUMANO' || c.roteiro === 'intencao_contratar') && !op.responsavelId) {
      op.responsavelId = atendenteU.id;
      op.row.responsavelId = atendenteU.id;
    }
    const item = c.itens[0]!;
    const slug = (op.row.produto ?? item.produto) as SlugProduto;
    const produtoNome = PRODUTOS[slug];
    const ctx: Ctx = {
      nome: c.primeiro || 'pessoal', categoria: item.categoria, item: item.descricao, paraQuem: item.fala, produto: PRODUTOS_COM_ARTIGO[slug], cidade: c.cidade,
      atendente: semResponsavel ? `a equipe ${setores.find((x) => x.id === setorId)?.nome ?? 'Comercial'}` : atendenteU.nome.split(' ')[0]!,
      equipeQtd: item.quantidade ?? 1, setorSuporte: SUPORTE,
    };

    // passos
    let passos: Passo[];
    let resumoRoteiro: ReturnType<(typeof ROTEIROS)[RoteiroId]['resumo']> | null = null;
    if (c.roteiro) {
      const r = ROTEIROS[c.roteiro];
      passos = r.passos(ctx);
      resumoRoteiro = r.resumo(ctx);
    } else {
      const cu = rng.pick(curtos(ctx)[grupo(op.etapa)]);
      passos = [{ de: 'cliente', texto: cu.cliente, sessao: true }, { de: 'ia', texto: cu.ia }];
      if (cu.extra) passos.push({ de: 'cliente', texto: cu.extra.cliente }, { de: 'ia', texto: cu.extra.ia });
      if (curtoModo === 'pausada') passos.pop();
      if (curtoModo === 'aguardando') {
        passos = [passos[0]!, { de: 'ia', texto: `Claro, ${ctx.nome}! Vou chamar um especialista pra te ajudar com a cotação.`, acoes: [{ ferramenta: 'solicitar_cotacao', entrada: { observacoes: `${produtoNome}: ${item.descricao}.` }, justificativa: 'A cotação precisa do time comercial.' }] }, { de: 'evento', texto: 'Conversa aguardando especialista' }];
      }
      if (curtoModo === 'humano') passos.push({ de: 'evento', texto: `Conversa transferida para ${ctx.atendente}` }, { de: 'atendente', texto: `Oi, ${ctx.nome}! Aqui é ${ctx.atendente}, da ${EMPRESA}. Já estou cuidando do seu pedido.` });
    }

    // horários
    const ultimoEvento = op.eventos[op.eventos.length - 1]!.criadoEm;
    const comecoJanela = op.criadaEm + 3 * MIN;
    let fim = Math.min(agoraMs - 2 * MIN, ultimoEvento + rng.int(0, 36) * HORA);
    if (c.roteiro === 'emergencia') fim = agoraMs - 14 * MIN;
    fim = Math.max(fim, comecoJanela + 30 * MIN);
    const tempos = agendar(passos, comecoJanela, fim, !cheia || c.roteiro === 'emergencia', rng);

    // materializa
    const versao = 1;
    const turnoPorPasso = new Map<number, string>();
    const idsPasso: string[] = [];
    const st = { ultimoCliId: null as string | null, ultimoCliMs: 0, primeiroCliMs: null as number | null, primeiroCliId: null as string | null, ultimaMsgMs: 0, ultimaMsgId: '' };
    let naoLidas = 0;
    const turnosConv: Array<{ turnoId: string; t: number; origem: string | null }> = [];
    passos.forEach((p, k) => {
      const t = tempos[k]!;
      const mid = `demo_m_${++mSeq}`;
      idsPasso.push(mid);
      const autor = p.de === 'cliente' ? 'cliente' : p.de === 'ia' ? 'ia' : p.de === 'sistema' || p.de === 'evento' ? 'sistema' : 'atendente';
      const tipo = p.de === 'evento' ? 'evento' : p.de === 'nota' ? 'nota_interna' : (p.tipo ?? 'texto');
      const saida = (autor === 'ia' || autor === 'atendente' || autor === 'sistema') && tipo !== 'evento' && tipo !== 'nota_interna';
      let turnoId: string | null = null;
      if ((p.de === 'ia' || p.de === 'sistema') && (p.de === 'ia' || (p.acoes?.length ?? 0) > 0)) {
        turnoId = `demo_t_${++tSeq}`;
        turnoPorPasso.set(k, turnoId);
        const origem = st.ultimoCliId;
        const ini = Math.max(st.ultimoCliMs + 1_500, t - 20_000);
        turnos.push({
          id: turnoId, conversationId: cvId, iniciadoEm: ts(Math.min(ini, t - 500)), finalizadoEm: ts(t - 200), modelo: MODELO_IA, versaoControle: versao, resultado: 'ok',
          usage: { input_tokens: rng.int(900, 2600), output_tokens: rng.int(40, 240) },
        });
        turnosConv.push({ turnoId, t, origem });
        const lista = [...(p.de === 'ia' ? [{ ferramenta: 'responder', entrada: { texto: p.texto }, justificativa: 'Respondeu à mensagem do cliente.' }] : []), ...(p.acoes ?? [])];
        lista.forEach((a, j) => {
          acoes.push({
            id: `demo_a_${++aSeq}`, agentTurnId: turnoId!, conversationId: cvId, ferramenta: a.ferramenta, entrada: a.entrada as Prisma.InputJsonValue,
            resultado: { ok: true }, justificativa: a.justificativa, mensagemOrigemId: origem, status: 'aplicada', criadoEm: ts(t - 400 + j),
          });
        });
      }
      mensagens.push({
        id: mid, conversationId: cvId, numeroId: numero.id, autor, tipo, texto: p.texto,
        status: saida ? (t < agoraMs - 3 * HORA ? 'lida' : 'entregue') : null,
        idExterno: `seed.${mSeq}`, autorUsuarioId: autor === 'atendente' ? atendenteU.id : null,
        agentTurnId: turnoId, versaoControle: turnoId ? versao : null, criadaEm: ts(t),
      });
      if (p.de === 'cliente') {
        st.ultimoCliId = mid;
        st.ultimoCliMs = t;
        if (st.primeiroCliMs === null) { st.primeiroCliMs = t; st.primeiroCliId = mid; }
      }
      st.ultimaMsgMs = t;
      st.ultimaMsgId = mid;
    });
    if (estado !== 'ENCERRADA') {
      for (let k = passos.length - 1; k >= 0; k--) {
        const d = passos[k]!.de;
        if (d === 'cliente') naoLidas++;
        else if (d === 'ia' || d === 'atendente' || d === 'sistema') break;
      }
    }

    // mover_etapa da IA: cola cada evento 'ia' ao turno mais próximo, se a ordem do histórico se mantiver.
    if (cheia && turnosConv.length) {
      const usados = new Set<string>();
      op.eventos.forEach((ev, i) => {
        if (i === 0 || ev.ator !== 'ia') return;
        const prev = op.eventos[i - 1]!.criadoEm;
        const next = op.eventos[i + 1]?.criadoEm ?? agoraMs;
        const cand = turnosConv.filter((x) => !usados.has(x.turnoId) && x.origem !== null && x.t > prev + 1000 && x.t < next - 1000).sort((a, b) => Math.abs(a.t - ev.criadoEm) - Math.abs(b.t - ev.criadoEm))[0];
        if (!cand) return;
        usados.add(cand.turnoId);
        ev.anexado = true;
        ev.criadoEm = cand.t;
        ev.mensagemOrigemId = cand.origem;
        acoes.push({
          id: `demo_a_${++aSeq}`, agentTurnId: cand.turnoId, conversationId: cvId, ferramenta: 'mover_etapa', entrada: { de: ev.de, para: ev.para },
          resultado: { ok: true }, justificativa: ev.justificativa, mensagemOrigemId: cand.origem, status: 'aplicada', criadoEm: ts(cand.t - 100),
        });
      });
    }

    conversas.push({
      id: cvId, contactId: c.id, numeroId: numero.id, estado, prioridade, setorId,
      responsavelId: estado === 'HUMANO' ? atendenteU.id : null,
      versaoControle: estado === 'IA_ATIVA' ? 1 : estado === 'HUMANO' ? 3 : 2,
      naoLidas, ultimaMensagemEm: ts(st.ultimaMsgMs), ultimaMensagemClienteEm: st.ultimoCliId ? ts(st.ultimoCliMs) : null,
      janelaAteEm: st.ultimoCliId ? ts(st.ultimoCliMs + 24 * HORA) : null, origemDemo: 'seed', createdAt: ts(tempos[0]!),
    });
    op.row.ultimoContatoClienteEm = st.ultimoCliId ? ts(st.ultimoCliMs) : null;
    // consentimento
    const revogado = c.roteiro === 'interrupcao';
    consentimentos.push({
      id: `demo_k_${c.id}`, contactId: c.id, status: revogado ? 'revogado' : 'concedido', mensagemOrigemId: st.primeiroCliId,
      em: ts(revogado ? st.ultimoCliMs : (st.primeiroCliMs ?? tempos[0]!)),
    });
    // resumo
    if (cheia || (estado === 'HUMANO' && rng.chance(0.4))) {
      const rs = resumoRoteiro ?? {
        querOQue: `${produtoNome} (${item.descricao})`, jaInformou: ['Interesse'], objecao: null, proximoPasso: `${ctx.atendente} acompanha o atendimento`,
      };
      resumos.push({
        id: `demo_s_${++sSeq}`, conversationId: cvId, querOQue: rs.querOQue, jaInformou: rs.jaInformou, objecao: rs.objecao, proximoPasso: rs.proximoPasso,
        ultimaMensagemId: st.ultimaMsgId, atualizadoEm: ts(st.ultimaMsgMs),
      });
    }
  });

  // ---------- finalização das oportunidades, objeções, tarefas ----------
  let obSeq = 0;
  let tkSeq = 0;
  const ci2 = new Map<string, ContatoI>(contatos.map((c) => [c.id, c]));
  const eventosRows: Prisma.OpportunityEventCreateManyInput[] = [];
  for (const o of oportunidades) {
    const c = ci2.get(o.row.contactId as string)!;
    const ult = o.eventos[o.eventos.length - 1]!;
    o.row.etapaDesde = ts(ult.criadoEm);
    const fechada = o.etapa === 'venda_confirmada' || o.etapa === 'perdido';
    o.row.fechadaEm = fechada ? ts(ult.criadoEm) : null;
    if (!o.row.ultimoContatoClienteEm) o.row.ultimoContatoClienteEm = ts(Math.min(agoraMs - MIN, ult.criadoEm + rng.int(0, 5) * HORA));
    if (o.etapa === 'venda_confirmada') {
      const atrib = c.origem === 'campanha' ? 'Campanha' : c.origem === 'indicacao' ? 'Indicação' : rng.pesos<string>([['IA qualificou e atendente fechou', 4], ['Atendente', 3], ['IA conduziu até a contratação', 2]]);
      o.row.camposIa = { atribuicao: atrib };
    }
    for (let i = 1; i < o.eventos.length; i++) {
      const e = o.eventos[i]!;
      if (e.ator !== 'ia' || e.anexado) continue;
      // IA só aparece como autora quando há AgentTurn + mover_etapa; senão, pessoa ou sistema.
      const prev = o.eventos[i - 1]!.para;
      const alternativas: TipoAtor[] = o.responsavelId ? ['humano', 'sistema'] : ['sistema'];
      const ator = alternativas.find((a) => podeMover(prev, e.para, a).ok);
      if (!ator) throw new Error(`Sem ator válido para ${prev} -> ${e.para}`);
      e.ator = ator;
      e.atorUsuarioId = ator === 'humano' ? o.responsavelId : null;
    }
    for (const e of o.eventos) {
      eventosRows.push({
        id: e.id, opportunityId: o.id, de: e.de, para: e.para, ator: e.ator, atorUsuarioId: e.atorUsuarioId, justificativa: e.justificativa,
        mensagemOrigemId: e.mensagemOrigemId, evidencia: (e.evidencia ?? undefined) as Prisma.InputJsonValue | undefined, criadoEm: ts(e.criadoEm),
      });
    }
    // estado do contato
    // objeções
    const tipos: Array<'preco' | 'confianca' | 'necessidade' | 'momento' | 'concorrente' | 'outro'> = [];
    if (o.etapa === 'perdido') tipos.push(MOTIVO_OBJECAO[o.motivoPerda ?? ''] ?? 'outro');
    else if (o.roteiro === 'objecao_preco') tipos.push('preco');
    else if (ETAPAS.indexOf(o.etapa) >= 4 && rng.chance(0.35)) tipos.push(rng.pick(['preco', 'confianca', 'necessidade', 'momento'] as const));
    if (o.etapa === 'perdido' && o.motivoPerda === 'Preço' && rng.chance(0.4)) tipos.push('necessidade');
    for (const tp of tipos) {
      objecoes.push({
        id: `demo_ob_${++obSeq}`, opportunityId: o.id, tipo: tp, descricao: rng.pick(DESC_OBJECAO[tp]!),
        criadaEm: ts(Math.max(o.eventos[Math.min(1, o.eventos.length - 1)]!.criadoEm, ult.criadoEm - rng.int(1, 48) * HORA)),
      });
    }
    // tarefas
    const resp2 = o.responsavelId ?? rng.pick(resp).id;
    const conv = o.principal ? o.convId : null;
    const nomeC = c.primeiro || c.nome;
    const tarefa = (tipo: Prisma.TaskCreateManyInput['tipo'], titulo: string, prazo: number, status: 'aberta' | 'concluida', sectorNome: string, extra: Partial<Prisma.TaskCreateManyInput> = {}) => {
      tarefas.push({
        id: `demo_tk_${++tkSeq}`, tipo, titulo, opportunityId: o.id, conversationId: conv, responsavelId: resp2, setorId: setor(sectorNome), prazoEm: ts(prazo), status,
        origemDemo: 'seed', criadaEm: ts(Math.min(agoraMs - MIN, ult.criadoEm)), concluidaEm: status === 'concluida' ? ts(Math.min(agoraMs - MIN, prazo)) : null, ...extra,
      });
    };
    const prazoAberto = (pVenc: number) => (rng.chance(pVenc) ? agoraMs - rng.int(2, 60) * HORA : agoraMs + rng.int(1, 60) * HORA);
    switch (o.etapa) {
      case 'aguardando_cotacao': tarefa('cotacao', `Cotar ${PRODUTOS[(o.row.produto ?? 'plano-completo') as SlugProduto]} para ${nomeC}`, prazoAberto(0.45), 'aberta', 'Comercial'); break;
      case 'proposta_enviada': case 'em_negociacao': if (rng.chance(0.85)) tarefa('retorno', `Retornar para ${nomeC} sobre a proposta`, prazoAberto(0.35), 'aberta', 'Comercial'); break;
      case 'contratacao_em_andamento':
        tarefa('encaminhar_contratacao', `Encaminhar contratação de ${nomeC}`, prazoAberto(0.3), 'aberta', 'Comercial', {
          checklist: [{ item: 'Documento do titular', feito: true }, { item: 'Dados de faturamento', feito: rng.chance(0.5) }, { item: 'Comprovante de endereço', feito: false }],
        });
        break;
      case 'venda_confirmada':
        if (ult.criadoEm > agoraMs - 10 * DAY && rng.chance(0.7)) tarefa('entrega', `Agendar implantação para ${nomeC}`, prazoAberto(0.4), 'aberta', SUPORTE);
        else if (rng.chance(0.5)) tarefa('pos_venda', `Contato de pós-venda com ${nomeC}`, Math.min(agoraMs - HORA, ult.criadoEm + 7 * DAY), 'concluida', 'Pós-venda');
        break;
      case 'em_atendimento': case 'qualificacao_concluida': if (rng.chance(0.2)) tarefa('retorno', `Retomar conversa com ${nomeC}`, prazoAberto(0.4), 'aberta', 'Comercial'); break;
      default: break;
    }
  }
  const emerg = contatos.find((c) => c.emergencia)!;
  tarefas.push({
    id: `demo_tk_${++tkSeq}`, tipo: 'outro', titulo: `Acompanhar caso urgente de ${emerg.primeiro || emerg.nome}: assalto relatado`, opportunityId: emerg.opps[0]!.id, conversationId: emerg.opps[0]!.convId,
    responsavelId: ana.id, setorId: setor(SUPORTE), prazoEm: ts(agoraMs - 5 * MIN), status: 'aberta', origemDemo: 'seed', criadaEm: ts(agoraMs - 14 * MIN),
  });

  // status do cliente
  const statusPorContato = new Map<string, 'lead' | 'cliente_ativo' | 'ex_cliente'>();
  for (const c of contatos) {
    const venda = c.opps.some((o) => o.etapa === 'venda_confirmada');
    statusPorContato.set(c.id, venda ? 'cliente_ativo' : c.opps.every((o) => o.etapa === 'perdido') ? 'ex_cliente' : 'lead');
  }

  // ---------- gravação em lote ----------
  const contatosRows: Prisma.ContactCreateManyInput[] = contatos.map((c) => ({
    id: c.id, nome: c.nome, e164: c.e164, cidade: c.cidade, uf: c.uf, origem: c.origem, statusCliente: statusPorContato.get(c.id)!, camposIa: {}, origemDemo: 'seed',
    createdAt: ts(Math.min(...c.opps.map((o) => o.criadaEm))),
  }));
  await lote(contatosRows, (d) => db.contact.createMany({ data: d }));
  await lote(consentimentos, (d) => db.consent.createMany({ data: d }));
  await lote(itens, (d) => db.interestItem.createMany({ data: d }));
  await lote(oportunidades.map((o) => o.row), (d) => db.opportunity.createMany({ data: d }));
  await lote(eventosRows, (d) => db.opportunityEvent.createMany({ data: d }));
  await lote(objecoes, (d) => db.objection.createMany({ data: d }));
  await lote(conversas, (d) => db.conversation.createMany({ data: d }));
  await lote(resumos, (d) => db.conversationSummary.createMany({ data: d }));
  await lote(turnos, (d) => db.agentTurn.createMany({ data: d }));
  await lote(mensagens, (d) => db.message.createMany({ data: d }));
  await lote(acoes, (d) => db.agentAction.createMany({ data: d }));
  await lote(tarefas, (d) => db.task.createMany({ data: d }));

  return {
    contatos: contatosRows.length, oportunidades: oportunidades.length, conversas: conversas.length, mensagens: mensagens.length, turnos: turnos.length,
    acoes: acoes.length, eventos: eventosRows.length, objecoes: objecoes.length, tarefas: tarefas.length, resumos: resumos.length,
  };
}

async function lote<T>(rows: T[], gravar: (chunk: T[]) => Promise<unknown>, tamanho = 500): Promise<void> {
  for (let i = 0; i < rows.length; i += tamanho) await gravar(rows.slice(i, i + tamanho));
}

/**
 * Horários de cada passo. Dentro de uma sessão os intervalos são de segundos/minutos; sessões ("outro dia")
 * ficam espalhadas entre `inicio` e `fim`. Conversa curta = uma sessão encostada em `fim`.
 */
function agendar(passos: Passo[], inicio: number, fim: number, curta: boolean, rng: Prng): number[] {
  const sessoes: number[][] = [];
  passos.forEach((p, i) => {
    if (i === 0 || p.sessao) sessoes.push([]);
    sessoes[sessoes.length - 1]!.push(i);
  });
  const offs: number[] = new Array(passos.length).fill(0);
  const comprimentos: number[] = [];
  for (const s of sessoes) {
    let acc = 0;
    s.forEach((idx, j) => {
      if (j > 0) {
        const de = passos[idx - 1]!.de;
        const p = passos[idx]!;
        acc += (de === 'cliente' && p.de === 'ia') || p.de === 'sistema' ? rng.int(8, 50) * 1000 : p.de === 'evento' ? 2_000 : rng.int(40, 600) * 1000;
      }
      offs[idx] = acc;
    });
    comprimentos.push(acc);
  }
  const total = comprimentos.reduce((a, b) => a + b, 0) + sessoes.length * MIN;
  const f = Math.min(1, (fim - inicio) / (total * 1.05 + 1));
  const inicios: number[] = [];
  const S = sessoes.length;
  const len = comprimentos.map((l) => l * f);
  if (curta || S === 1) {
    inicios.push(curta ? fim - len[0]! : inicio);
  } else {
    const ultimo = Math.max(inicio + len[0]! + MIN, fim - len[S - 1]!);
    for (let k = 0; k < S; k++) {
      const alvo = k === 0 ? inicio : k === S - 1 ? ultimo : inicio + ((ultimo - inicio) * k) / (S - 1);
      inicios.push(k === 0 ? alvo : Math.max(alvo, inicios[k - 1]! + len[k - 1]! + MIN));
    }
  }
  const out: number[] = new Array(passos.length).fill(0);
  sessoes.forEach((s, k) => s.forEach((idx, j) => (out[idx] = Math.round(inicios[k]! + offs[idx]! * f) + j)));
  // estritamente crescente
  for (let i = 1; i < out.length; i++) if (out[i]! <= out[i - 1]!) out[i] = out[i - 1]! + 1_000;
  return out;
}

