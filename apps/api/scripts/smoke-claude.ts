/**
 * Smoke real do agente: UMA chamada à API com o formato de produção (system com cache_control,
 * todas as ferramentas, histórico de 2 mensagens + estado como {role:'system'}, betas e fallbacks),
 * pelo ClaudeClient. Imprime stop_reason, ferramentas chamadas e usage. Nunca imprime a chave.
 *
 *   pnpm --filter @sales-hub/api exec dotenv -e ../../.env -- tsx scripts/smoke-claude.ts
 */
import type { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { getEmpresaConfig } from '../src/config/claude';
import { ClaudeClient } from '../src/modules/agent/claude.client';
import { montarPromptEstavel } from '../src/modules/agent/prompt/estavel';
import { definicoesFerramentas } from '../src/modules/agent/tools/definicoes';

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY ausente');
  const prisma = new PrismaClient();
  const [produtos, precos, faqs] = await Promise.all([
    prisma.product.findMany({ where: { aprovado: true } }),
    prisma.priceRule.findMany({ where: { aprovado: true } }),
    prisma.faq.findMany({ where: { aprovado: true } }),
  ]);
  await prisma.$disconnect();

  const config = { get: (k: string) => process.env[k] } as unknown as ConfigService;
  const llm = new ClaudeClient(config);
  const empresa = getEmpresaConfig(config);
  const estado = [
    'Estado atual (montado pelo sistema a cada turno; não mostre ao cliente).',
    'Agora: quarta-feira, 11/11/2026 14:00 (horário de Brasília).',
    'Janela de 24 h do WhatsApp: aberta.',
    'Contato: nome não informado; cidade não informada; UF não informada; situação lead.',
    'Permissão de contato: sem restrição.',
    'Itens de interesse: nenhum registrado.',
    'Oportunidade aberta: nenhuma.',
    'Tarefas abertas: nenhuma.',
  ].join('\n');

  const inicio = Date.now();
  const r = await llm.responder({
    system: [
      { type: 'text', text: montarPromptEstavel(
          { produtos, precos, faqs },
          { emojisModerados: true, empresaNome: empresa.nome, empresaDescricao: empresa.descricao, termosProibidos: empresa.termosProibidos },
        ), cache_control: { type: 'ephemeral' } },
    ],
    tools: definicoesFerramentas(),
    messages: [
      { role: 'user', content: [{ type: 'text', text: 'Oi, boa tarde' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Oi! Boa tarde. Como posso te ajudar?' }] },
      { role: 'user', content: [{ type: 'text', text: 'quanto custa o plano completo pra minha empresa? somos 15 pessoas' }] },
      { role: 'system', content: estado },
    ],
  });
  console.log(`modelo: ${r.model}`);
  console.log(`stop_reason: ${r.stop_reason}`);
  console.log(`tempo: ${Date.now() - inicio} ms`);
  for (const b of r.content) {
    if (b.type === 'tool_use') console.log(`ferramenta: ${b.name} ${JSON.stringify(b.input)}`);
    else if (b.type === 'text') console.log(`texto: ${b.text}`);
    else console.log(`bloco: ${b.type}`);
  }
  console.log(`usage: ${JSON.stringify(r.usage)}`);
}

main().catch((e) => {
  console.error(`erro: ${(e as Error).message}`);
  process.exit(1);
});
