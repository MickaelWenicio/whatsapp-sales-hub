import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const E164_PLACEHOLDER = '+5500900000000';

/** Normalizacao E.164 simples: so digitos; sem DDI (10 ou 11 digitos) assume Brasil (+55). */
function normalizarE164(bruto: string): string | null {
  const digitos = bruto.replace(/\D/g, '');
  if (!digitos) return null;
  if (!bruto.trim().startsWith('+') && (digitos.length === 10 || digitos.length === 11)) {
    return `+55${digitos}`;
  }
  return `+${digitos}`;
}

function listaE164(env: string | undefined): string[] {
  const itens = (env ?? '')
    .split(',')
    .map((s) => normalizarE164(s))
    .filter((s): s is string => s !== null);
  return [...new Set(itens)];
}

async function senhaAleatoria(): Promise<string> {
  return bcrypt.hash(randomBytes(24).toString('hex'), 10);
}

async function seedUsuarios(): Promise<void> {
  const email = (process.env.SEED_DONO_EMAIL ?? 'dono@example.com').toLowerCase();
  const nome = process.env.SEED_DONO_NOME ?? 'Apresentador';
  const senha = process.env.SEED_DONO_SENHA;
  if (!senha) throw new Error('SEED_DONO_SENHA ausente no .env');

  const existente = await prisma.user.findUnique({ where: { email } });
  if (!existente) {
    await prisma.user.create({
      data: { nome, email, papel: 'dono', senhaHash: await bcrypt.hash(senha, 10), ativo: true },
    });
  }

  const ficticios = [
    { nome: 'Gestor Comercial', email: 'gestor@example.com', papel: 'gestor' as const },
    { nome: 'Ana Ribeiro', email: 'atendente1@example.com', papel: 'atendente' as const },
    { nome: 'Bruno Costa', email: 'atendente2@example.com', papel: 'atendente' as const },
  ];
  for (const u of ficticios) {
    const ja = await prisma.user.findUnique({ where: { email: u.email } });
    if (ja) continue; // nunca sobrescreve senha existente
    await prisma.user.create({ data: { ...u, senhaHash: await senhaAleatoria(), ativo: true } });
  }
}

async function seedSetores(): Promise<void> {
  for (const nome of ['Comercial', 'Suporte', 'Pós-venda']) {
    await prisma.sector.upsert({ where: { nome }, update: {}, create: { nome } });
  }
}

async function seedNumeros(): Promise<void> {
  const instancia = process.env.EVOLUTION_INSTANCE || 'sales-hub';
  const e164Agente = normalizarE164(process.env.NUMERO_AGENTE_E164 ?? '');
  await prisma.whatsAppNumber.upsert({
    where: { instanciaEvolution: instancia },
    // So atualiza o e164 quando o .env o informa; sem isso preserva o que ja estiver gravado.
    update: e164Agente ? { e164: e164Agente } : {},
    create: {
      rotulo: 'Comercial',
      e164: e164Agente ?? E164_PLACEHOLDER,
      instanciaEvolution: instancia,
    },
  });
}

async function seedCatalogo(): Promise<void> {
  const produtos = [
    {
      slug: 'plano-essencial',
      nome: 'Plano Essencial',
      descricao: 'O plano de entrada, com o serviço principal e atendimento pelo WhatsApp.',
      beneficios: [
        'Serviço principal incluso',
        'Painel online',
        'Suporte pelo WhatsApp',
        'Relatórios mensais',
        'Sem fidelidade',
      ],
      condicoes: 'Valores e condições conforme o plano contratado.',
      preco: { rotulo: 'a partir de R$ 69,90/mês', valorCentavos: 6990, sobCotacao: false },
    },
    {
      slug: 'plano-completo',
      nome: 'Plano Completo',
      descricao: 'Tudo do Plano Essencial, com recursos extras e atendimento prioritário.',
      beneficios: [
        'Tudo do Plano Essencial',
        'Atendimento prioritário',
        'Relatórios personalizados',
        'Consultor dedicado',
        'Implantação assistida',
      ],
      condicoes: 'Sempre conforme o plano e as condições contratadas. Preço sob cotação.',
      preco: { rotulo: 'sob cotação', valorCentavos: null, sobCotacao: true },
    },
    {
      slug: 'solucoes-empresas',
      nome: 'Soluções para Empresas',
      descricao: 'Planos sob medida para empresas e equipes, sem fidelidade.',
      beneficios: [
        'Painel online para a equipe',
        'Vários usuários',
        'Relatórios gerenciais',
        'Suporte pelo WhatsApp',
        'Sem fidelidade',
        'Implantação em até 48h',
      ],
      condicoes: 'Sem fidelidade. Implantação em até 48h. Valores sob cotação conforme o tamanho da empresa.',
      preco: { rotulo: 'sob cotação', valorCentavos: null, sobCotacao: true },
    },
  ];

  for (const p of produtos) {
    const { preco, ...dados } = p;
    const produto = await prisma.product.upsert({
      where: { slug: p.slug },
      update: { ...dados, aprovado: true },
      create: { ...dados, aprovado: true },
    });
    const regra = await prisma.priceRule.findFirst({
      where: { productId: produto.id, demonstracao: false },
    });
    if (regra) {
      await prisma.priceRule.update({ where: { id: regra.id }, data: { ...preco, aprovado: true } });
    } else {
      await prisma.priceRule.create({
        data: { productId: produto.id, ...preco, aprovado: true, demonstracao: false },
      });
    }
  }

  const faqs = [
    {
      pergunta: 'Qual a diferença entre o Plano Essencial e o Plano Completo?',
      resposta:
        'O Plano Essencial traz o serviço principal, o painel online e o suporte pelo WhatsApp. O Plano Completo inclui tudo isso, mais atendimento prioritário, relatórios personalizados e um consultor dedicado. Tudo conforme o plano e as condições contratadas.',
    },
    {
      pergunta: 'Como funciona o painel online?',
      resposta:
        'Depois da contratação, você recebe o acesso ao painel online, onde acompanha os serviços, os relatórios e os chamados de suporte.',
    },
    {
      pergunta: 'Em quanto tempo é feita a implantação para empresas?',
      resposta: 'Para empresas, a implantação é feita em até 48h, e não há fidelidade.',
    },
    {
      pergunta: 'Vocês atendem todo o Brasil?',
      resposta: 'Sim, atendemos todo o Brasil.',
    },
  ];
  for (const f of faqs) {
    const ja = await prisma.faq.findFirst({ where: { pergunta: f.pergunta } });
    if (ja) await prisma.faq.update({ where: { id: ja.id }, data: { resposta: f.resposta, aprovado: true } });
    else await prisma.faq.create({ data: { ...f, aprovado: true } });
  }
}

async function seedConfiguracoes(): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { chave: 'iaGlobalAtiva' },
    update: {}, // nao religa a IA se o gestor a desligou
    create: { chave: 'iaGlobalAtiva', valor: true },
  });
  const permitidos = listaE164(process.env.DEMO_ALLOWED_NUMBERS);
  await prisma.systemSetting.upsert({
    where: { chave: 'demoNumerosPermitidos' },
    update: { valor: permitidos },
    create: { chave: 'demoNumerosPermitidos', valor: permitidos },
  });
}

async function main(): Promise<void> {
  await seedUsuarios();
  await seedSetores();
  await seedNumeros();
  await seedCatalogo();
  await seedConfiguracoes();
  console.log('Seed base concluido.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
