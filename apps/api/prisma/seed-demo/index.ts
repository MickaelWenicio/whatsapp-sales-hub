import { PrismaClient } from '@prisma/client';
import { apagarBaseDemo, gerarBaseDemo } from './gerador';

async function main() {
  const prisma = new PrismaClient();
  const agora = new Date(); // único relógio da execução; o gerador não consulta o relógio
  const t0 = Date.now();
  try {
    await apagarBaseDemo(prisma);
    const r = await gerarBaseDemo(prisma, { agora });
    console.log(`Base fictícia gerada em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.table(r);
    const porEtapa = await prisma.opportunity.groupBy({ by: ['etapa'], where: { origemDemo: 'seed' }, _count: true });
    console.log('Oportunidades por etapa:', Object.fromEntries(porEtapa.map((e) => [e.etapa, e._count])));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
