import { configDefaults, defineConfig } from 'vitest/config';

// Testes unitários (CI-safe). Exclui os *.e2e.test.ts, que precisam de Postgres.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/*.e2e.test.ts'],
  },
});
