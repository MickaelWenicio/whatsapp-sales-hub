# Setup local

## Pre-requisitos
- Node 22+, pnpm 10 (`packageManager` do repo) e Docker (Docker Desktop no Windows ou macOS).
- No Windows, se `docker` nao estiver no PATH: `C:\Program Files\Docker\Docker\resources\bin`.
- Portas livres no host: 5436 (Postgres), 6379 (Redis), 8080 (Evolution), 3311 (API), 3000 (painel).

## .env
Copie `.env.example` para `.env` na raiz e preencha: `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_TOKEN`,
`ADMIN_API_TOKEN`, `AUTH_SECRET` (valores aleatorios, ex.: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`),
`NUMERO_AGENTE_E164`, `DEMO_ALLOWED_NUMBERS` e os `SEED_DONO_*`. O `.env` nunca e commitado.

Opcionais:
- `ANTHROPIC_API_KEY`: liga o agente de IA real (Claude). Sem a chave, so o roteiro local de demonstracao responde, e apenas a contatos ficticios.
- `EMPRESA_NOME` e `EMPRESA_DESCRICAO`: nome e descricao da empresa usados pelo agente (padrao: `Empresa Exemplo`).
- `NEXT_PUBLIC_EMPRESA_NOME`: nome da empresa exibido no painel (padrao: `Empresa Exemplo`).
- `AGENT_TERMOS_PROIBIDOS`: lista separada por virgula de termos que o agente nao pode usar (padrao: nenhum).

## Primeira vez
```
pnpm setup
pnpm dev:evolution
```
`pnpm setup` instala as dependencias, compila o `@sales-hub/shared`, aplica as migracoes e roda o seed base
(dono, equipe de demonstracao, setores, numero Comercial e catalogo).
`dev:evolution` sobe Postgres, Redis, Evolution e provisiona a instancia `sales-hub` com o webhook
`http://host.docker.internal:3311/webhook/evolution?token=...`.

## Pareamento do WhatsApp
Caminho mais facil: no painel, em Conexoes e equipe → Numeros, clique em Exibir QR de pareamento. Ou abra o
Evolution Manager em http://localhost:8080/manager, entre com a `EVOLUTION_API_KEY`, abra a instancia `sales-hub`
e leia o QR (WhatsApp > Aparelhos conectados > Conectar aparelho).

Alternativa por API:
```
curl -s -H "apikey: $EVOLUTION_API_KEY" http://localhost:8080/instance/connect/sales-hub
curl -s -H "apikey: $EVOLUTION_API_KEY" http://localhost:8080/instance/connectionState/sales-hub
```
O primeiro devolve o QR (`base64`/`code`); o segundo deve mostrar `"state":"open"` apos parear.

## Rodar
```
pnpm dev
pnpm --filter @sales-hub/api db:seed:demo
```
`pnpm dev` sobe a API (web e worker) e o painel. O painel fica em http://localhost:3000; entre com
`SEED_DONO_EMAIL` e `SEED_DONO_SENHA`.

## Reiniciar a demo
Rode `pnpm --filter @sales-hub/api db:seed:demo` de novo. Ele apaga e regenera a base ficticia
(o que foi criado ao vivo tambem sai) e preserva usuarios, setores, numeros, catalogo e configuracoes.

## Problemas comuns
- Porta 3000 ocupada: encerre o outro `next dev` ou libere a porta antes de `pnpm dev`.
- Porta 5436/6379/8080 ocupada: outro container/servico a usa (`docker ps`, `netstat -ano`); pare-o.
- Docker parado: abra o Docker Desktop e espere o engine subir.
- QR expirado: o QR muda a cada ~30 s; gere outro (painel, Manager ou `instance/connect`).
