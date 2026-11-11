import type { Faq, PriceRule, Product } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { montarPromptEstavel, type ConfigPrompt } from './estavel';

const produtos: Product[] = [
  {
    id: 'p2',
    slug: 'plano-completo',
    nome: 'Plano Completo',
    descricao: 'Tudo do Plano Essencial, com recursos extras.',
    beneficios: ['Atendimento prioritário', 'Relatórios personalizados', 'Consultor dedicado'],
    condicoes: 'Sempre conforme o plano e as condições contratadas. Preço sob cotação.',
    aprovado: true,
  },
  {
    id: 'p1',
    slug: 'plano-essencial',
    nome: 'Plano Essencial',
    descricao: 'O plano de entrada, com o serviço principal.',
    beneficios: ['Painel online', 'Suporte pelo WhatsApp'],
    condicoes: 'Conforme o plano contratado.',
    aprovado: true,
  },
  {
    id: 'p3',
    slug: 'solucoes-empresas',
    nome: 'Soluções para Empresas',
    descricao: 'Planos sob medida para empresas.',
    beneficios: ['Vários usuários', 'Sem fidelidade', 'Implantação em até 48h'],
    condicoes: 'Sem fidelidade.',
    aprovado: true,
  },
];
const precos: PriceRule[] = [
  { id: 'r2', productId: 'p2', categoria: null, rotulo: 'sob cotação', valorCentavos: null, sobCotacao: true, aprovado: true, demonstracao: false },
  { id: 'r1', productId: 'p1', categoria: null, rotulo: 'a partir de R$ 69,90/mês', valorCentavos: 6990, sobCotacao: false, aprovado: true, demonstracao: false },
  { id: 'r3', productId: 'p3', categoria: null, rotulo: 'sob cotação', valorCentavos: null, sobCotacao: true, aprovado: true, demonstracao: false },
];
const faqs: Faq[] = [
  { id: 'f2', pergunta: 'Vocês atendem todo o Brasil?', resposta: 'Sim.', aprovado: true },
  { id: 'f1', pergunta: 'Como funciona o painel online?', resposta: 'Você recebe o acesso depois da contratação.', aprovado: true },
];

const cfg = (extra: Partial<ConfigPrompt> = {}): ConfigPrompt => ({
  emojisModerados: true,
  empresaNome: 'Empresa Exemplo',
  empresaDescricao: 'Empresa de serviços por assinatura para pessoas e empresas.',
  ...extra,
});

describe('montarPromptEstavel', () => {
  it('é determinístico: mesmo catálogo (em qualquer ordem) → strings idênticas', () => {
    const a = montarPromptEstavel({ produtos, precos, faqs }, cfg());
    const b = montarPromptEstavel(
      { produtos: [...produtos].reverse(), precos: [...precos].reverse(), faqs: [...faqs].reverse() },
      cfg(),
    );
    expect(a).toBe(b);
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}/); // sem datas
  });

  it('usa o nome e a descrição da empresa configurados', () => {
    const p = montarPromptEstavel({ produtos, precos, faqs }, cfg({ empresaNome: 'Loja Teste', empresaDescricao: 'Vendemos planos de internet.' }));
    expect(p).toContain('Você é a assistente virtual da Loja Teste no WhatsApp. Vendemos planos de internet.');
    expect(p).not.toContain('Empresa Exemplo');
  });

  it('contém responder, o preço aprovado, os slugs do catálogo e as regras de venda honesta', () => {
    const p = montarPromptEstavel({ produtos, precos, faqs }, cfg());
    expect(p).toContain('responder');
    expect(p).toContain('Preço: R$ 69,90 (a partir de R$ 69,90/mês).');
    expect(p).toContain('Slug: plano-essencial');
    expect(p).toContain('Slug: solucoes-empresas');
    expect(p).toContain('solicitar_cotacao');
    expect(p).toContain('registrar_item');
    expect(p).toMatch(/Não ofereça desconto/);
    expect(p).toMatch(/Não prometa recurso, resultado, prazo nem condição/);
  });

  it('lista os termos proibidos só quando configurados', () => {
    const sem = montarPromptEstavel({ produtos, precos, faqs }, cfg());
    expect(sem).not.toMatch(/Não use estas palavras/);
    const com = montarPromptEstavel({ produtos, precos, faqs }, cfg({ termosProibidos: ['garantido', ' melhor do mercado ', ''] }));
    const linhas = com.split('\n').filter((l) => /garantido/.test(l));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toContain('Não use estas palavras ou expressões: "garantido", "melhor do mercado".');
  });

  it('respeita o interruptor de emojis', () => {
    expect(montarPromptEstavel({ produtos, precos, faqs }, cfg())).toMatch(/no máximo 1 emoji/i);
    expect(montarPromptEstavel({ produtos, precos, faqs }, cfg({ emojisModerados: false }))).toMatch(/não use emojis/i);
  });

  it('omite itens não aprovados e preços de demonstração', () => {
    const p = montarPromptEstavel(
      {
        produtos: [...produtos, { ...produtos[0]!, id: 'p9', slug: 'zzz', nome: 'Produto Rascunho', aprovado: false }],
        precos: [...precos, { ...precos[1]!, id: 'r9', rotulo: 'R$ 49,90 demo', valorCentavos: 4990, demonstracao: true }],
        faqs: [...faqs, { id: 'f9', pergunta: 'Pergunta rascunho?', resposta: 'x', aprovado: false }],
      },
      cfg(),
    );
    expect(p).not.toContain('Produto Rascunho');
    expect(p).not.toContain('49,90');
    expect(p).not.toContain('Pergunta rascunho');
  });
});
