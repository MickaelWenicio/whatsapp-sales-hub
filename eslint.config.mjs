import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '.worktrees/**',
      '.superpowers/**',
      'scripts/**',
      '**/*.config.*',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // ─── Painel (Next.js/React) ────────────────────────────────────────────────
  // Sem estes plugins, os `eslint-disable-next-line react-hooks/exhaustive-deps` e
  // `@next/next/no-img-element` espalhados pelo painel apontavam para regras INEXISTENTES:
  // o ESLint tratava cada um como erro ("Definition for rule ... was not found") e o
  // `pnpm lint` — que roda no CI — falhava. Pior: as regras de hooks nunca foram checadas,
  // então dependência faltando em useEffect/useMemo passava batido justamente no app que
  // faz polling de conversas.
  //
  // De propósito só as DUAS regras clássicas de hooks: o react-hooks v7 traz um conjunto
  // novo e opinativo (static-components, use-memo, preserve-manual-memoization…) que não
  // tem a ver com o que este código já suprime.
  {
    files: ['apps/painel/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // O painel é App Router (`src/app`): esta regra procura um `pages/` que não existe e
      // imprime um aviso de diretório ausente a cada execução do lint.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
);
