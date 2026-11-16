import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { filtrarBolha, lerTermosProibidos } from '@sales-hub/shared';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../security/audit.service';

const msgTermoProibido = (termo: string) =>
  `Não use "${termo}": é um termo proibido pela empresa (AGENT_TERMOS_PROIBIDOS).`;

const texto = (max: number) => z.string().trim().min(1, 'Preencha o campo.').max(max, `Use no máximo ${max} caracteres.`);

const produtoSchema = z.object({
  nome: texto(120),
  descricao: texto(1000),
  beneficios: z.array(texto(300)).max(30, 'Use no máximo 30 benefícios.').default([]),
  condicoes: z.string().trim().max(1000, 'Use no máximo 1000 caracteres.').default(''),
  aprovado: z.boolean().default(true),
});
const precoSchema = z
  .object({
    productId: z.string().min(1),
    rotulo: texto(120),
    valorCentavos: z.number().int().min(0).max(100_000_000, 'Valor acima do limite permitido.').nullable().default(null),
    sobCotacao: z.boolean().default(false),
    aprovado: z.boolean().default(true),
  })
  .refine((p) => p.sobCotacao || p.valorCentavos !== null, {
    message: 'Informe o valor ou marque como sob cotação.',
  });
const faqSchema = z.object({
  pergunta: texto(300),
  resposta: texto(2000),
  aprovado: z.boolean().default(true),
});

function slugify(nome: string): string {
  return (
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'produto'
  );
}

function coletarTextos(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(coletarTextos);
  if (v && typeof v === 'object') return Object.values(v).flatMap(coletarTextos);
  return [];
}

/**
 * Valida com zod (400 em pt-BR) e bloqueia os termos proibidos pela empresa em qualquer texto
 * (mesma regra do filtro de saída do agente: ignora maiúsculas e acentos, só a palavra inteira).
 */
export function validarCatalogo<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
  termosProibidos: readonly string[] = [],
): z.infer<T> {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new BadRequestException(r.error.issues[0]?.message || 'Dados inválidos.');
  }
  if (termosProibidos.length) {
    for (const t of coletarTextos(r.data)) {
      const f = filtrarBolha(t, [], termosProibidos);
      if (!f.ok && f.motivo === 'termo_proibido') throw new BadRequestException(msgTermoProibido(f.termo ?? ''));
    }
  }
  return r.data;
}

@Injectable()
export class CatalogoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  /** Termos proibidos (AGENT_TERMOS_PROIBIDOS) que não podem entrar no catálogo. */
  private termos(): string[] {
    return lerTermosProibidos(this.config?.get<string>('AGENT_TERMOS_PROIBIDOS'));
  }

  private async auditar(ator: string, acao: string, entidade: string, entidadeId: string) {
    await this.audit.registrar({ ator: `usuario_painel:${ator}`, acao, entidade, entidadeId });
  }

  async listar() {
    const [produtos, precos, faqs] = await Promise.all([
      this.prisma.product.findMany({ orderBy: { nome: 'asc' } }),
      this.prisma.priceRule.findMany({ orderBy: [{ productId: 'asc' }, { rotulo: 'asc' }] }),
      this.prisma.faq.findMany({ orderBy: { pergunta: 'asc' } }),
    ]);
    return {
      produtos: produtos.map((p) => ({
        id: p.id,
        slug: p.slug,
        nome: p.nome,
        descricao: p.descricao,
        beneficios: p.beneficios,
        condicoes: p.condicoes,
        aprovado: p.aprovado,
      })),
      precos: precos.map((p) => ({
        id: p.id,
        productId: p.productId,
        rotulo: p.rotulo,
        valorCentavos: p.valorCentavos,
        sobCotacao: p.sobCotacao,
        aprovado: p.aprovado,
      })),
      faqs: faqs.map((f) => ({ id: f.id, pergunta: f.pergunta, resposta: f.resposta, aprovado: f.aprovado })),
    };
  }

  async criarProduto(body: unknown, ator: string) {
    const dto = validarCatalogo(produtoSchema, body, this.termos());
    const base = slugify(dto.nome);
    let slug = base;
    for (let i = 2; await this.prisma.product.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    const p = await this.prisma.product.create({ data: { ...dto, slug } });
    await this.auditar(ator, 'catalogo_produto_criado', 'product', p.id);
    return p;
  }
  async atualizarProduto(id: string, body: unknown, ator: string) {
    const dto = validarCatalogo(produtoSchema, body, this.termos());
    if (!(await this.prisma.product.findUnique({ where: { id } }))) {
      throw new NotFoundException('Produto não encontrado.');
    }
    const p = await this.prisma.product.update({ where: { id }, data: dto });
    await this.auditar(ator, 'catalogo_produto_atualizado', 'product', id);
    return p;
  }
  async removerProduto(id: string, ator: string) {
    if (!(await this.prisma.product.findUnique({ where: { id } }))) {
      throw new NotFoundException('Produto não encontrado.');
    }
    await this.prisma.product.delete({ where: { id } }); // preços saem em cascata
    await this.auditar(ator, 'catalogo_produto_removido', 'product', id);
  }

  async criarPreco(body: unknown, ator: string) {
    const dto = validarCatalogo(precoSchema, body, this.termos());
    if (!(await this.prisma.product.findUnique({ where: { id: dto.productId } }))) {
      throw new BadRequestException('Produto não encontrado.');
    }
    const p = await this.prisma.priceRule.create({
      data: { ...dto, valorCentavos: dto.sobCotacao ? null : dto.valorCentavos },
    });
    await this.auditar(ator, 'catalogo_preco_criado', 'price_rule', p.id);
    return p;
  }
  async atualizarPreco(id: string, body: unknown, ator: string) {
    const dto = validarCatalogo(precoSchema, body, this.termos());
    if (!(await this.prisma.priceRule.findUnique({ where: { id } }))) {
      throw new NotFoundException('Preço não encontrado.');
    }
    const p = await this.prisma.priceRule.update({
      where: { id },
      data: { ...dto, valorCentavos: dto.sobCotacao ? null : dto.valorCentavos },
    });
    await this.auditar(ator, 'catalogo_preco_atualizado', 'price_rule', id);
    return p;
  }
  async removerPreco(id: string, ator: string) {
    if (!(await this.prisma.priceRule.findUnique({ where: { id } }))) {
      throw new NotFoundException('Preço não encontrado.');
    }
    await this.prisma.priceRule.delete({ where: { id } });
    await this.auditar(ator, 'catalogo_preco_removido', 'price_rule', id);
  }

  async criarFaq(body: unknown, ator: string) {
    const dto = validarCatalogo(faqSchema, body, this.termos());
    const f = await this.prisma.faq.create({ data: dto });
    await this.auditar(ator, 'catalogo_faq_criada', 'faq', f.id);
    return f;
  }
  async atualizarFaq(id: string, body: unknown, ator: string) {
    const dto = validarCatalogo(faqSchema, body, this.termos());
    if (!(await this.prisma.faq.findUnique({ where: { id } }))) {
      throw new NotFoundException('Pergunta não encontrada.');
    }
    const f = await this.prisma.faq.update({ where: { id }, data: dto });
    await this.auditar(ator, 'catalogo_faq_atualizada', 'faq', id);
    return f;
  }
  async removerFaq(id: string, ator: string) {
    if (!(await this.prisma.faq.findUnique({ where: { id } }))) {
      throw new NotFoundException('Pergunta não encontrada.');
    }
    await this.prisma.faq.delete({ where: { id } });
    await this.auditar(ator, 'catalogo_faq_removida', 'faq', id);
  }
}
