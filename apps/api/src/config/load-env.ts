import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Carrega o `.env` da RAIZ do monorepo (subindo a árvore a partir do cwd).
 * Em produção (Docker), o `.env` não existe e as variáveis vêm do ambiente do
 * processo — este loader então é um no-op e `process.env` prevalece.
 *
 * Deve ser importado ANTES de qualquer módulo que leia `process.env`.
 */
function loadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      config({ path: candidate });
      return;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  // fallback: dotenv procura .env no cwd; se não houver, usa process.env puro
  config();
}

loadRootEnv();
