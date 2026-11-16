import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { CatalogoService } from './catalogo.service';

function amb() {
  const produtos: any[] = [];
  const faqs: any[] = [];
  const auditoria: string[] = [];
  const prisma: any = {
    product: {
      findUnique: async ({ where }: any) =>
        produtos.find((p) => (where.id ? p.id === where.id : p.slug === where.slug)) ?? null,
      create: async ({ data }: any) => {
        const p = { id: `p${produtos.length + 1}`, ...data };
        produtos.push(p);
        return p;
      },
      update: async ({ where, data }: any) => Object.assign(produtos.find((p) => p.id === where.id), data),
      delete: async ({ where }: any) => produtos.splice(produtos.findIndex((p) => p.id === where.id), 1),
    },
    faq: {
      create: async ({ data }: any) => {
        const f = { id: `f${faqs.length + 1}`, ...data };
        faqs.push(f);
        return f;
      },
    },
    priceRule: {},
  };
  const audit: any = { registrar: async (e: any) => void auditoria.push(e.acao) };
  const config: any = { get: (k: string) => (k === 'AGENT_TERMOS_PROIBIDOS' ? 'garantido, melhor do mercado' : undefined) };
  return { svc: new CatalogoService(prisma, audit, config), produtos, auditoria };
}
const prod = { nome: 'Plano Básico', descricao: 'O plano de entrada', beneficios: ['Painel online'], condicoes: '' };

describe('CatalogoService', () => {
  it('cria produto com slug único e audita', async () => {
    const { svc, produtos, auditoria } = amb();
    await svc.criarProduto(prod, 'u1');
    await svc.criarProduto(prod, 'u1');
    expect(produtos.map((p) => p.slug)).toEqual(['plano-basico', 'plano-basico-2']);
    expect(auditoria).toEqual(['catalogo_produto_criado', 'catalogo_produto_criado']);
  });
  it('adiciona benefício via PUT e remove produto', async () => {
    const { svc, produtos } = amb();
    const p = await svc.criarProduto(prod, 'u1');
    await svc.atualizarProduto(p.id, { ...prod, beneficios: ['Painel online', 'Suporte pelo WhatsApp'] }, 'u1');
    expect(produtos[0].beneficios).toHaveLength(2);
    await svc.removerProduto(p.id, 'u1');
    expect(produtos).toHaveLength(0);
  });
  it('bloqueia os termos proibidos configurados em qualquer texto', async () => {
    const { svc, produtos } = amb();
    await expect(svc.criarProduto({ ...prod, beneficios: ['O MELHOR do mercado'] }, 'u1')).rejects.toThrow(
      'Não use "melhor do mercado": é um termo proibido pela empresa (AGENT_TERMOS_PROIBIDOS).',
    );
    await expect(svc.criarFaq({ pergunta: 'É garantido?', resposta: 'Sim' }, 'u1')).rejects.toThrow(/"garantido"/);
    expect(produtos).toHaveLength(0);
  });
  it('não confunde com palavras que contêm o termo, e sem lista nada é bloqueado', async () => {
    const { svc } = amb();
    await expect(
      svc.criarFaq({ pergunta: 'Tem garantia estendida?', resposta: 'Garantidamente sim.' }, 'u1'),
    ).resolves.toBeTruthy();
    const semLista = new CatalogoService({ faq: { create: async ({ data }: any) => data } } as any, { registrar: async () => undefined } as any);
    await expect(semLista.criarFaq({ pergunta: 'É garantido?', resposta: 'Sim' }, 'u1')).resolves.toBeTruthy();
  });
  it('rejeita dados inválidos com 400', async () => {
    const { svc } = amb();
    await expect(svc.criarProduto({ nome: '' }, 'u1')).rejects.toThrow();
  });
});
