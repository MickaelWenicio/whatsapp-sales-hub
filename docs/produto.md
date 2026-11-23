# Central Comercial: visão de produto

## O que é

Uma central comercial de WhatsApp para pequenas e médias empresas que vendem pela conversa. Num só painel, a equipe atende clientes numa tela no estilo WhatsApp Web, acompanha um agente de IA que conversa, registra dados e move oportunidades, e assume o atendimento a qualquer momento. As conversas alimentam um CRM simples (contatos, interesses, funil, tarefas) e uma visão geral com os indicadores da operação.

O nome da empresa e a descrição usados pelo agente e pelo painel são configuráveis (`EMPRESA_NOME`, `EMPRESA_DESCRICAO` e `NEXT_PUBLIC_EMPRESA_NOME`). A interface e o código estão em português do Brasil.

## Para quem

- **Dono ou gestor:** quer ver quem está falando com a empresa, quem está perto de fechar, quem precisa de retorno, o que a IA fez em cada conversa e onde as vendas se perdem.
- **Atendentes:** conversam com os clientes, assumem casos que a IA não deve conduzir e mantêm o funil em dia.

A experiência gira em torno de cinco perguntas: quem está falando com a empresa agora, quem está perto de contratar, quem precisa de retorno, o que a IA fez em cada atendimento e onde estamos perdendo vendas.

## Princípios

- **O WhatsApp é a tela principal.** CRM, tarefas e resumo aparecem ao lado da conversa, sem trocar de tela.
- **A IA propõe, o backend decide.** Regras do funil, catálogo aprovado, filtro de saída e travas de envio ficam no servidor, e não no prompt.
- **Tudo o que a IA faz deixa rastro.** Cada ação grava a ferramenta, a entrada, o resultado e uma justificativa curta, exibidos na Trilha da conversa.
- **Uma pessoa sempre pode parar a IA.** Assumir ou pausar interrompe na hora, inclusive as mensagens que já estavam na fila.
- **Venda só se confirma com evidência.** "Quero contratar" é intenção. A venda confirmada é feita por uma pessoa e pede uma evidência.

## Telas e módulos

| Tela | O que faz | Situação |
|---|---|---|
| Visão geral | Prioridades do dia, indicadores com definição e origem, distribuição do funil e atribuição das vendas (IA, humano, misto). Seletor de período. | Real, calculada a partir da base |
| Assistente | Conversa com um assistente sobre a operação. | Protótipo visual: respostas pré-definidas, sem modelo de linguagem |
| Atendimento | Lista de conversas com filtros, histórico, envio de mensagem, notas internas, faixa de condução (estado da IA) e coluna de contexto com contato, interesse, oportunidade, resumo e Trilha da IA. | Real (texto) |
| Contatos | Busca, ficha do contato e exportação CSV dos contatos exibidos. | Real na leitura; ficha em parte visual |
| Funil | Kanban com nove etapas, filtros, busca e movimentação por menu ou arrastar. "Venda confirmada" pede evidência; "Perdido" pede motivo. | Real |
| Propostas | Rascunho e prévia de proposta; "Simular envio" e "Simular aceite". | Protótipo visual: nada é enviado e não há PDF |
| Recuperação | Seis passos para reativar leads parados: objetivo, público, mensagem (com variações), revisão, simulação e resultado. | Protótipo: as variações de texto podem ser geradas pela IA (com chave), mas o envio é sempre simulado (zero envios reais) |
| Automações | Regras de acompanhamento com gatilho, etapas e condições de parada. | Protótipo visual: as regras ficam no navegador e nada é agendado |
| Agente de IA | Lista de agentes, autonomia, horários, mensagens de abertura e ausência, regras de transferência e o catálogo (produtos, preços, perguntas frequentes). | Catálogo real, gravado no banco e usado pelo agente; autonomia, horários e as demais preferências são só visuais (não são gravadas) |
| Conexões e equipe | Números de WhatsApp, pareamento por QR, estado da conexão, equipe, números permitidos da demonstração e simulador de cliente. | Real |

Na barra superior ficam o estado da conexão (só números reais contam), o interruptor geral da IA e o selo de dados de demonstração.

## O que funciona de verdade

- **Canal WhatsApp por Evolution API:** pareamento por QR, recebimento por webhook com token, fila de entrada com deduplicação, fila de saída com status (pendente, enviada, entregue, lida, falhou, cancelada) e reenvio sem duplicar. Só mensagens de **texto** estão integradas; mídia, áudio e transcrição ainda não.
- **Controle humano/IA:** estados `IA_ATIVA`, `HUMANO`, `IA_PAUSADA`, `AGUARDANDO_ESPECIALISTA` e `ENCERRADA`; ações Assumir, Pausar, Transferir, Devolver à IA e Encerrar; interruptor geral da IA (dono e gestor).
- **Agente de IA (Claude):** quando há `ANTHROPIC_API_KEY`, o agente responde pelo WhatsApp com ferramentas (responder, atualizar contato, registrar item de interesse e interesse, mover etapa, registrar objeção, pedir cotação, sinalizar intenção, transferir, emergência e interrupção). Ele só atende números da lista de permitidos; os demais ficam para uma pessoa. Sem chave, um roteiro local determinístico, sem modelo, responde só a contatos fictícios em modo de demonstração.
- **Funil com evidência:** grafo de etapas validado no servidor, com eventos de mudança (de, para, ator, justificativa e mensagem de origem).
- **Catálogo editável:** produtos, benefícios, preços aprovados ou "sob cotação" e FAQs. O agente só usa o que está aprovado.
- **Filtro de saída:** antes de enviar, cada bolha da IA é conferida. Valores em R$ fora do catálogo aprovado, ofertas de desconto e termos da lista `AGENT_TERMOS_PROIBIDOS` são bloqueados, e o modelo precisa reescrever.
- **Emergência e interrupção:** um pré-classificador determinístico roda antes de cada turno. Em emergência (assalto, acidente, pedido de socorro), sai só um texto fixo e a conversa vai para uma pessoa, com prioridade máxima. Em pedido de interrupção, o consentimento é revogado, sai uma confirmação fixa e os envios automáticos param.
- **Tempo real:** eventos no Redis entregues ao painel por SSE.
- **Segurança:** login com papéis (dono, gestor, atendente), autorização por rota sem ator padrão, auditoria encadeada por hash e criptografia opcional de dados pessoais em repouso.

## Modo demonstração

- `pnpm --filter @sales-hub/api db:seed:demo` gera uma base fictícia **determinística** (semente fixa) de 90 dias: cerca de 180 contatos, 220 oportunidades distribuídas no funil, conversas com Trilha da IA, objeções, tarefas e resumos. O negócio fictício vende serviços por assinatura: Plano Essencial (o único com preço público, "a partir de R$ 69,90/mês"), Plano Completo e Soluções para Empresas (sob cotação).
- Todos os telefones da base usam a faixa `+55 00 9…` (DDD 00 não existe), para nenhum número pertencer a alguém real.
- Com `DEMO_MODE=true`, só os números da lista de permitidos recebem mensagens reais. Os envios para os demais são simulados no processador de saída, abaixo de qualquer outra lógica.
- O simulador de cliente (Conexões e equipe) faz mensagens entrarem pelo mesmo pipeline de entrada.

## Decisões de arquitetura

- **Monorepo pnpm** com `apps/api` (NestJS + Prisma + PostgreSQL + BullMQ/Redis), `apps/painel` (Next.js App Router + React 19 + Tailwind v4 + Radix/shadcn) e `packages/shared` (enums, contratos, funil, filtro de saída, pré-classificador).
- **Um código, dois processos:** a API roda como `web` (webhook, API do painel e SSE) ou `worker` (filas, agente e envios), pela variável `PROCESS_ROLE`.
- **Fronteira painel ↔ API:** o navegador fala só com o Next.js. O servidor do painel chama a API com um token de administração e o id do usuário logado; sem ator válido, a API responde 401.
- **Garantia de parada:** cada conversa tem uma `versaoControle`, que sobe em toda mudança de estado ou de responsável. Toda mensagem automática carrega a versão em que nasceu e é conferida no processador de saída, em transação, logo antes do envio. Se a conversa saiu de `IA_ATIVA`, a versão mudou, a IA global foi desligada ou o contato pediu interrupção, a mensagem é cancelada.
- **Junção de mensagens:** mensagens seguidas do cliente esperam um silêncio curto (`AGENT_DEBOUNCE_MS`, com teto em `AGENT_DEBOUNCE_MAX_MS`) antes de um único turno da IA, com trava por conversa no Redis.
- **Prompt pensado para cache:** um bloco estável (persona, regras, limites, catálogo aprovado) e o estado atual da conversa como mensagem de sistema no fim, montada pelo backend a cada turno.
- **Porta de canal (`ChannelPort`):** o adaptador da Evolution é o único implementado. A porta deixa espaço para a API oficial do WhatsApp.
- **Janela de 24 horas:** a conversa guarda até quando vale a janela de atendimento, como preparo para a API oficial.

## Próximos passos possíveis

- Mídia, áudio e transcrição no atendimento.
- Propostas com PDF e envio real; campanhas de recuperação com envio em lote controlado.
- Acompanhamentos automáticos com condições de parada.
- Níveis de autonomia (assistida, parcial com aprovação, automática) aplicados no servidor.
- Adaptador para a API oficial do WhatsApp (Cloud API).
