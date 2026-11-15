// Verificação visual local: usa credenciais existentes sem imprimi-las e nunca envia mensagens.
import { chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'apps/api/package.json'));
const env = require('dotenv').parse(readFileSync(path.join(root, '.env')));
const baseURL = process.env.PROTOTIPO_URL ?? 'http://localhost:3000';
const output = path.join(root, '.superpowers/prototipo-verificacao');
mkdirSync(output, { recursive: true });
const launch = { headless: true };
if (!existsSync(chromium.executablePath()) && process.env.LOCALAPPDATA) {
  const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
  if (existsSync(cache)) {
    const installed = readdirSync(cache)
      .filter((n) => /^chromium-\d+$/.test(n))
      .sort()
      .reverse();
    const executable = installed
      .map((n) => path.join(cache, n, 'chrome-win64/chrome.exe'))
      .find(existsSync);
    if (executable) launch.executablePath = executable;
  }
}
const browser = await chromium.launch(launch);
const context = await browser.newContext({
  baseURL,
  viewport: { width: 1440, height: 900 },
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
});
const page = await context.newPage();
const errors = [];
const outbound = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (request.method() === 'POST' && /\/api\/bff\/conversas\/[^/]+\/mensagens/.test(request.url()))
    outbound.push(request.url());
});
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
const screenshot = (name) =>
  page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
try {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill(env.SEED_DONO_EMAIL);
  await page.getByLabel('Senha', { exact: true }).fill(env.SEED_DONO_SENHA);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/visao-geral', { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Prioridades de hoje', exact: true })).toBeVisible(
    { timeout: 60_000 },
  );
  check(
    (await page
      .getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link')
      .count()) === 10,
    'Navegação incompleta',
  );
  console.log('PASS login e visão geral');
  const lista = await page.request.get('/api/bff/conversas?limite=50');
  check(lista.ok(), 'BFF de conversas indisponível');
  const conversas = await lista.json();
  const conversa = conversas.itens[0];
  check(conversa?.id, 'Base de apresentação sem conversas');

  for (const rota of [
    'visao-geral',
    'contatos',
    'propostas',
    'recuperacao',
    'automacoes',
    'agente',
    'funil',
    'conexoes',
  ]) {
    await page.goto(`/${rota}`);
    await expect(page.locator('main').first()).toBeVisible();
    await expect(page.getByRole('switch', { name: 'IA da operação', exact: true })).toBeEnabled({
      timeout: 30_000,
    });
    if (rota === 'visao-geral')
      await expect(
        page.getByRole('heading', { name: 'Prioridades de hoje', exact: true }),
      ).toBeVisible({ timeout: 30_000 });
    if (rota === 'funil')
      await expect(page.locator('main article').first()).toBeVisible({ timeout: 30_000 });
    if (rota === 'contatos')
      await expect(page.locator('main tbody tr').first()).toBeVisible({ timeout: 30_000 });
    if (rota === 'conexoes')
      await expect(page.getByText('Números da operação', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
    await screenshot(`desktop-${rota}`);
    console.log(`PASS tela /${rota}`);
  }

  await page.goto(`/atendimento?c=${conversa.id}`);
  await expect(
    page.getByRole('heading', {
      name: conversa.contato.nome ?? conversa.contato.telefoneExibicao,
      exact: true,
    }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Novo atendimento', exact: true })).toBeVisible();
  const maisConversas = page.getByRole('button', { name: 'Carregar mais', exact: true });
  if (await maisConversas.isVisible()) {
    await maisConversas.click();
    await expect(page.getByText('100', { exact: true })).toBeVisible({ timeout: 30_000 });
    console.log('PASS paginação de conversas');
  }
  await screenshot('desktop-atendimento');
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole('complementary', { name: 'Contexto da conversa' })).toBeVisible();
  await screenshot('1280-atendimento');
  console.log('PASS atendimento em 3 colunas em 1280x720');

  const equipe = await page.request.get('/api/bff/equipe');
  check(equipe.ok(), 'BFF equipe indisponível');
  const semSessao = await context.request.get('http://localhost:3311/admin/conversas');
  check(semSessao.status() === 401, 'API administrativa não rejeitou acesso sem credencial');

  await page.goto('/propostas');
  await page.getByRole('button', { name: 'Nova proposta', exact: true }).click();
  await page.getByRole('button', { name: 'Criar rascunho', exact: true }).click();
  await expect(page.getByText('Rascunho demonstrativo criado.')).toBeVisible();
  console.log('PASS proposta demonstrativa sem envio');

  await page.goto('/recuperacao');
  for (let i = 0; i < 4; i++)
    await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('button', { name: 'Executar simulação', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Prévia concluída', exact: true })).toBeVisible();
  await screenshot('recuperacao-resultado');
  console.log('PASS recuperação em 6 passos sem disparo');

  await page.goto('/agente');
  await page.getByRole('button', { name: 'Mensagens', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Abertura', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Salvar prévia', exact: true }).click();
  check(
    Boolean(await page.evaluate(() => localStorage.getItem('saleshub-agente-preview'))),
    'Configuração visual não persistida',
  );
  console.log('PASS configuração visual local');

  await page.setViewportSize({ width: 390, height: 844 });
  for (const rota of ['visao-geral', 'atendimento', 'conexoes', 'agente']) {
    await page.goto(`/${rota}`);
    await expect(page.locator('main').first()).toBeVisible();
    if (rota === 'visao-geral')
      await expect(
        page.getByRole('heading', { name: 'Prioridades de hoje', exact: true }),
      ).toBeVisible({ timeout: 30_000 });
    if (rota === 'atendimento')
      await expect(
        page
          .getByText(conversa.contato.nome ?? conversa.contato.telefoneExibicao, { exact: true })
          .first(),
      ).toBeVisible({ timeout: 30_000 });
    if (rota === 'conexoes')
      await expect(page.getByText('Números da operação', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
    await screenshot(`mobile-${rota}`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    check(!overflow, `Overflow horizontal global em /${rota}`);
    console.log(`PASS mobile /${rota}`);
  }
  await page.goto(`/atendimento?c=${conversa.id}`);
  await expect(
    page.getByRole('heading', {
      name: conversa.contato.nome ?? conversa.contato.telefoneExibicao,
      exact: true,
    }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole('button', { name: 'Voltar às conversas', exact: true }),
  ).toBeVisible();
  await screenshot('mobile-conversa');
  await page.getByRole('button', { name: 'Voltar às conversas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Novo atendimento', exact: true })).toBeVisible();
  console.log('PASS abrir e voltar à conversa no celular');
  if (process.argv.includes('--simulate')) {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
    let contactId;
    try {
      check(env.DEMO_MODE === 'true', 'Simulação exige DEMO_MODE=true');
      const response = await page.request.post('/api/bff/demo/simulador', {
        data: {
          novoContato: { nome: `Verificação visual ${Date.now()}` },
          texto: 'Olá! Gostaria de saber mais sobre os planos de vocês.',
        },
      });
      check(response.ok(), 'Não foi possível iniciar o simulador');
      const created = await response.json();
      const detail = await (
        await page.request.get(`/api/bff/conversas/${created.conversationId}`)
      ).json();
      check(/^\+5500/.test(detail.contato.e164), 'Simulação não criou telefone fictício');
      contactId = detail.contato.id;
      await expect
        .poll(
          async () => {
            const data = await (
              await page.request.get(`/api/bff/conversas/${created.conversationId}/mensagens`)
            ).json();
            return data.itens.some((m) => m.autor === 'ia' && m.status === 'lida');
          },
          { timeout: 60_000, intervals: [500, 1000, 2000] },
        )
        .toBe(true);
      const sent = await prisma.message.findMany({
        where: { conversationId: created.conversationId, autor: 'ia' },
      });
      check(
        sent.every((m) => !m.idExterno),
        'Saída demonstrativa retornou identificador de canal externo',
      );
      console.log(
        'PASS simulador completo: entrada → roteiro local → saída lida, sem identificador externo',
      );
    } finally {
      if (contactId)
        await prisma.contact.deleteMany({
          where: { id: contactId, origemDemo: 'ao_vivo', e164: { startsWith: '+5500' } },
        });
      await prisma.$disconnect();
    }
  }
  check(outbound.length === 0, 'Verificação tentou enviar mensagem real');
  check(errors.length === 0, `Erros de JavaScript: ${errors.join('; ')}`);
  console.log(`PASS sem erros de JavaScript; zero envios. Imagens em ${output}`);
} finally {
  await browser.close();
}
