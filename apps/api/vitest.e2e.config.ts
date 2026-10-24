import { defineConfig } from 'vitest/config';

// Testes de integração (precisam de Postgres com migrations + seed aplicados).
// Rodar com `pnpm --filter @sales-hub/api test:e2e` (carrega DATABASE_URL via dotenv).
export default defineConfig({
  test: {
    include: ['**/*.e2e.test.ts'],
    testTimeout: 20_000,
    // Todos os e2e compartilham UM Postgres. O expurgo de retenção (retention.processor.e2e)
    // roda uma operação GLOBAL no banco; em paralelo ele corre com dados que outros arquivos
    // estão criando/apagando. Serializa os arquivos para eliminar essas corridas (a suíte é rápida).
    fileParallelism: false,
  },
});
