# WhatsApp Sales Hub

A WhatsApp sales console for small and mid-sized businesses: an AI agent talks to customers, keeps a lightweight CRM up to date and hands over to a person whenever the team wants.

> **Status: work in progress / prototype.** Some screens are fully wired to the backend, others are visual prototypes running on demo data. See [What works today](#what-works-today).
>
> The user interface, the code identifiers and the docs under `docs/` are in **Brazilian Portuguese**.

## Features

- **WhatsApp Web–style inbox.** Conversation list with filters, message history, manual replies, internal notes and a context column with the contact, their interest, the open opportunity, an AI-generated summary and the agent's **action trail** (every tool call with its input, result and a one-line justification).
- **Human/AI control.** Each conversation has an explicit state (`IA_ATIVA`, `HUMANO`, `IA_PAUSADA`, `AGUARDANDO_ESPECIALISTA`, `ENCERRADA`). Take over, pause, transfer, hand back or close. A global kill switch turns the AI off. Automated messages already in the queue are cancelled right before sending if the conversation changed hands.
- **AI sales agent (Claude).** Tool-calling agent that replies in short WhatsApp bubbles, records contact data and interests, moves the opportunity, logs objections, requests quotes, flags purchase intent and transfers to a person. Deterministic pre-classification routes emergencies and opt-out requests to fixed messages, without the model.
- **Kanban pipeline with evidence.** Nine stages validated server-side. Every move is stored as an event (from, to, actor, justification, source message). Only a person can confirm a sale, and it requires evidence; "lost" requires a reason.
- **Lead recovery.** A six-step flow (goal, audience, message, review, simulation, result) to reactivate stalled leads, with AI-generated message variations and a simulated run (no real sends).
- **Editable catalog with an output filter.** Products, benefits, approved prices or "on quote", and FAQs. Before sending, every AI bubble is checked: amounts in R$ outside the approved catalog, discount offers and configurable forbidden terms are blocked and the model has to rewrite.
- **QR pairing through Evolution API.** Pair a WhatsApp number from the panel, watch the connection status, receive messages via webhook and send through a queue with delivery status and retry without duplicates.
- **Demo mode with a fictitious dataset.** A deterministic seed creates 90 days of data (about 180 contacts, 220 opportunities, conversations, tasks and summaries) for a generic subscription-services business. In demo mode, only allow-listed numbers receive real messages; everything else is simulated. A customer simulator feeds messages through the real inbound pipeline.

## What works today

| Area | Status |
|---|---|
| Inbox, human/AI control, internal notes, action trail | Working (text messages only) |
| WhatsApp connection (Evolution API), QR pairing, inbound webhook, outbound queue | Working (text only; media, audio and transcription are not integrated yet) |
| AI agent (Claude) | Working when `ANTHROPIC_API_KEY` is set; it only answers allow-listed numbers. Without a key, a local scripted responder (no LLM) answers fictitious contacts in demo mode |
| Pipeline (kanban), contacts list and CSV export, overview metrics | Working, backed by the database |
| Catalog editor (products, prices, FAQs) | Working, stored in the database and used by the agent |
| Lead recovery | Prototype: AI message variations are real (with a key), sending is always simulated |
| Proposals, automations, in-app assistant, agent settings (autonomy, hours, greetings) | Visual prototypes on demo data; nothing is sent, scheduled or persisted server-side |

## Tech stack

- **API:** Node.js 22, TypeScript, NestJS, Prisma, PostgreSQL 16, BullMQ + Redis 7, Anthropic SDK, zod. The same code runs as a `web` process (webhook, panel API, SSE) or a `worker` process (queues, agent, outbound), selected by `PROCESS_ROLE`.
- **Panel:** Next.js (App Router), React 19, Tailwind CSS v4, Radix/shadcn UI, TanStack Query, dnd-kit, Recharts, Auth.js (credentials).
- **Channel:** Evolution API (WhatsApp Web protocol) behind a `ChannelPort` interface.
- **Real time:** Redis pub/sub events streamed to the panel over SSE.
- **Quality:** Vitest (unit and integration), Playwright (prototype walkthrough), ESLint, Prettier.

## Monorepo layout

```
apps/
  api/        NestJS API and worker; Prisma schema, migrations, base seed and demo seed (prisma/seed-demo)
  painel/     Next.js panel
packages/
  shared/     Enums, API contracts, pipeline rules, output filter, pre-classifier, phone helpers
scripts/      Dev runner, Evolution provisioning, prototype verification
docs/         Product overview, local setup and demo script (Portuguese)
docker-compose.dev.yml   Postgres, Redis and (profile "evolution") Evolution API
```

## Running locally

Requirements: Node 22+, pnpm 10 and Docker. Ports 5436 (Postgres), 6379 (Redis), 8080 (Evolution), 3311 (API) and 3000 (panel) must be free.

1. Copy `.env.example` to `.env` and fill in at least `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_TOKEN`, `ADMIN_API_TOKEN`, `AUTH_SECRET`, `NUMERO_AGENTE_E164`, `DEMO_ALLOWED_NUMBERS` and the `SEED_DONO_*` owner credentials. For the panel, copy `apps/painel/.env.local.example` to `apps/painel/.env.local`.
2. First run:
   ```
   pnpm setup            # install, build shared, run migrations, base seed
   pnpm dev:evolution    # Postgres, Redis, Evolution + instance "sales-hub" with the webhook
   ```
3. Start everything and load the demo data:
   ```
   pnpm dev
   pnpm --filter @sales-hub/api db:seed:demo
   ```
4. Open http://localhost:3000 and sign in with `SEED_DONO_EMAIL` / `SEED_DONO_SENHA`.
5. To pair WhatsApp, go to *Conexões e equipe → Números* and show the pairing QR (or use the Evolution Manager at http://localhost:8080/manager).

Running `db:seed:demo` again regenerates the fictitious dataset. More details (in Portuguese): [`docs/setup/local.md`](docs/setup/local.md) and [`docs/demo/roteiro.md`](docs/demo/roteiro.md).

Useful commands: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm verify:prototype` (Playwright walkthrough, needs the stack running).

## Main environment variables

| Variable | Purpose |
|---|---|
| `EMPRESA_NOME`, `EMPRESA_DESCRICAO` | Company name and short description used by the agent (default `Empresa Exemplo`) |
| `NEXT_PUBLIC_EMPRESA_NOME` | Company name shown in the panel (in `apps/painel/.env.local`) |
| `ANTHROPIC_API_KEY` | Enables the Claude agent and AI message variations |
| `AGENT_MODEL`, `AGENT_EFFORT` | Model id and effort level for the agent |
| `AGENT_TERMOS_PROIBIDOS` | Comma-separated terms the agent must never use (blocked by the output filter) |
| `AGENT_DEBOUNCE_MS`, `AGENT_DEBOUNCE_MAX_MS`, `AGENT_HISTORICO_MAX` | Wait before an AI turn, its cap, and how many messages of history go to the model |
| `DATABASE_URL`, `REDIS_URL` | Postgres and Redis connections |
| `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `EVOLUTION_WEBHOOK_TOKEN` | Evolution API connection, instance name (`sales-hub`) and webhook token |
| `ADMIN_API_TOKEN`, `AUTH_SECRET` | Panel-to-API token and session signing secret |
| `DEMO_MODE`, `DEMO_ALLOWED_NUMBERS` | Demo mode and the E.164 numbers allowed to receive real messages |
| `NUMERO_AGENTE_E164` | The WhatsApp number the agent operates |
| `PII_ENCRYPTION_ENABLED`, `PII_ENCRYPTION_KEY` | Optional encryption of personal data at rest |
| `SEED_DONO_NOME`, `SEED_DONO_EMAIL`, `SEED_DONO_SENHA` | Owner account created by the base seed |

The full list, with defaults, is in [`apps/api/src/config/env.ts`](apps/api/src/config/env.ts) and [`.env.example`](.env.example).

## Documentation

- [`docs/produto.md`](docs/produto.md): product overview, screens, what is real and what is a prototype, architecture decisions.
- [`docs/setup/local.md`](docs/setup/local.md): local setup.
- [`docs/demo/roteiro.md`](docs/demo/roteiro.md): demo walkthrough and the scenarios in the fictitious dataset.

## License

No license specified yet.
