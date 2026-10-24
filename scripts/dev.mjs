// Dev com UM comando: infra (Postgres+Redis) + shared + migrations + api (web/worker) + painel.
// Uso: node scripts/dev.mjs [--only api-tsc|api-web|api-worker|painel]
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const pnpm = isWin ? 'pnpm.cmd' : 'pnpm';
const DOCKER_WIN = 'C:/Program Files/Docker/Docker/resources/bin/docker.exe';

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

const cores = ['\x1b[36m', '\x1b[35m', '\x1b[33m', '\x1b[32m'];
const reset = '\x1b[0m';

const emUso = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function dockerBin() {
  const r = spawnSync('docker', ['--version'], { stdio: 'ignore', shell: isWin });
  if (r.status === 0) return 'docker';
  if (isWin && existsSync(DOCKER_WIN)) return DOCKER_WIN;
  return 'docker';
}

function runSync(cmd, cmdArgs, extraEnv = {}) {
  const r = spawnSync(cmd, cmdArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: isWin && cmd.endsWith('.cmd'),
    env: { ...process.env, ...extraEnv },
  });
  return r.status === 0;
}

const filhos = [];
function iniciar(nome, cor, cmd, cmdArgs, env = {}) {
  const p = spawn(cmd, cmdArgs, {
    cwd: root,
    shell: isWin && cmd.endsWith('.cmd'),
    env: { ...process.env, ...env },
  });
  const prefixo = `${cores[cor % cores.length]}[${nome}]${reset} `;
  const saida = (stream) => {
    let resto = '';
    stream.on('data', (d) => {
      const linhas = (resto + d.toString()).split(/\r?\n/);
      resto = linhas.pop();
      for (const l of linhas) console.log(prefixo + l);
    });
  };
  saida(p.stdout);
  saida(p.stderr);
  p.on('exit', (code) => console.log(`${prefixo}encerrou (${code})`));
  filhos.push(p);
  return p;
}

function encerrar() {
  for (const p of filhos) {
    if (p.exitCode !== null) continue;
    if (isWin) spawnSync('taskkill', ['/pid', String(p.pid), '/t', '/f'], { stdio: 'ignore' });
    else p.kill('SIGINT');
  }
}
process.on('SIGINT', () => (encerrar(), process.exit(0)));
process.on('SIGTERM', () => (encerrar(), process.exit(0)));

async function esperarArquivo(arquivo, ms = 120_000) {
  const fim = Date.now() + ms;
  while (!existsSync(arquivo)) {
    if (Date.now() > fim) throw new Error(`timeout esperando ${arquivo}`);
    await sleep(500);
  }
}

const apiTsc = () =>
  iniciar('api-tsc', 0, pnpm, [
    'exec',
    'tsc',
    '-p',
    'apps/api/tsconfig.json',
    '--watch',
    '--preserveWatchOutput',
  ]);

async function apiNode(nome, cor, arquivo, role) {
  const alvo = path.join(root, 'apps/api/dist', arquivo);
  await esperarArquivo(alvo);
  iniciar(nome, cor, process.execPath, ['--watch', `apps/api/dist/${arquivo}`], {
    PROCESS_ROLE: role,
  });
}

const painelExiste = existsSync(path.join(root, 'apps/painel/package.json'));
const painel = () => {
  if (!painelExiste) return console.log('painel: apps/painel ainda nao existe - pulando.');
  iniciar('painel', 3, pnpm, ['--filter', '@sales-hub/painel', 'dev']);
};

async function main() {
  if (only) {
    if (only === 'api-tsc') apiTsc();
    else if (only === 'api-web') await apiNode('api-web', 1, 'main-web.js', 'web');
    else if (only === 'api-worker') await apiNode('api-worker', 2, 'main-worker.js', 'worker');
    else if (only === 'painel') painel();
    else {
      console.error(`--only desconhecido: ${only}`);
      process.exit(1);
    }
    return;
  }

  // 1) infra
  if ((await emUso(5436)) && (await emUso(6379))) {
    console.log('> infra ja de pe (Postgres 5436 / Redis 6379) - reusando.');
  } else {
    console.log('> subindo infra (Postgres + Redis)...');
    if (!runSync(dockerBin(), ['compose', '-f', 'docker-compose.dev.yml', 'up', '-d'])) {
      console.error('falha ao subir o docker compose (Docker Desktop esta rodando?)');
      process.exit(1);
    }
    for (let i = 0; i < 30 && !(await emUso(5436)); i++) await sleep(1000);
    if (!(await emUso(5436))) {
      console.error('Postgres nao respondeu na 5436 em 30 s');
      process.exit(1);
    }
  }

  // 2) shared
  console.log('> build de @sales-hub/shared...');
  if (!runSync(pnpm, ['--filter', '@sales-hub/shared', 'build'])) process.exit(1);

  // 3) migrations
  console.log('> prisma migrate deploy...');
  if (!runSync(pnpm, ['--filter', '@sales-hub/api', 'db:deploy'])) {
    console.warn('! migrate deploy falhou - siga assim mesmo (rode manualmente depois).');
  }

  // 4) app
  apiTsc();
  if (await emUso(3311)) console.log('> :3311 ja em uso - nao subo outra api-web.');
  else await apiNode('api-web', 1, 'main-web.js', 'web');
  await apiNode('api-worker', 2, 'main-worker.js', 'worker');
  painel();
  console.log('> tudo no ar. Ctrl-C encerra tudo.');
}

main().catch((e) => {
  console.error(e);
  encerrar();
  process.exit(1);
});
