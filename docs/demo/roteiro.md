# Apresentação do protótipo

Interface navegável com dados fictícios de um negócio de serviços por assinatura. A conexão e as mensagens de texto do WhatsApp são a integração real. Não é uma implantação de produção.

## Abrir a central

1. Deixe o Docker aberto.
2. Na raiz, execute `pnpm dev:evolution` e depois `pnpm dev`.
3. Acesse `http://localhost:3000` e entre com o usuário definido em `SEED_DONO_EMAIL` e `SEED_DONO_SENHA` no `.env` local.
4. Confira Conexões e equipe. O estado da barra superior considera somente números reais.

Numa instalação nova, rode `pnpm setup` e `pnpm --filter @sales-hub/api db:seed:demo`. Reaplicar esse último comando substitui a base fictícia (inclusive o que foi criado ao vivo).

## O que a base fictícia contém

O negócio fictício ("Empresa Exemplo", ou o nome em `EMPRESA_NOME`) vende três produtos:

- **Plano Essencial:** o único com preço público, "a partir de R$ 69,90/mês".
- **Plano Completo:** suporte prioritário, relatórios e painel online; sob cotação.
- **Soluções para Empresas:** sob cotação, sem fidelidade, implantação em até 48h.

São cerca de 180 contatos fictícios (telefones na faixa `+55 00 9…`), 220 oportunidades no funil e conversas com Trilha da IA. Cada oportunidade aponta para um **item de interesse** do contato: uso pessoal, plano residencial (casal ou família), empresa pequena, projeto pontual ou empresa com equipe grande. As conversas com histórico completo seguem estes cenários:

| Cenário | Onde encontrar | O que mostra |
|---|---|---|
| Qualificação | Topo do funil (Novo lead até Aguardando cotação) | A IA se apresenta, registra para quem é o serviço e a solução atual, identifica a preocupação com o suporte e pede a cotação do Plano Completo |
| Empresa | Do meio do funil para cima, contatos com nome de empresa | Equipe de 15 a 60 pessoas em duas unidades; a IA registra o tamanho da equipe e pede cotação de Soluções para Empresas |
| Objeção de preço | Proposta enviada, Em negociação e Perdido | Cliente acha o Plano Completo caro; a IA registra a objeção, cita só o preço aprovado e combina um retorno |
| Intenção de contratar | Contratação em andamento, Em negociação e Venda confirmada | Cliente pede para fechar, envia documento e a conversa passa para um atendente |
| Transferência | Qualificação concluída até Proposta enviada | Cliente pede para falar com uma pessoa; a conversa vai para um atendente ou fica aguardando especialista |
| Atendimento humano | Proposta enviada, Em negociação e Venda confirmada | A IA transfere, o atendente assume, deixa uma nota interna e responde sobre fidelidade e suporte |
| Interrupção | Perdido | Cliente pede para não receber mais mensagens; sai o texto fixo e o consentimento é revogado |
| Emergência | Uma conversa, no topo da lista, em vermelho | Cliente relata um assalto; sai só o texto fixo de emergência e a conversa vai para o setor de suporte, com tarefa aberta |

As demais conversas trazem só as últimas mensagens, coerentes com a etapa (primeiro contato, dúvida sobre a proposta, documentos, implantação, pós-venda ou perda).

## Sequência sugerida de apresentação

1. **Visão geral:** prioridades de hoje, indicadores com definição e origem, distribuição do funil e atribuição. O seletor de período altera os indicadores; prioridades e situação atual do funil representam a operação agora.
2. **Atendimento:** abra uma conversa do cenário de qualificação. Mostre lista, faixa de condução, mensagens, resumo, item de interesse e Trilha com justificativa. Em 1280×720 as três colunas ficam visíveis. Em telas pequenas o contexto abre no botão Detalhes.
3. **Controle humano:** use Assumir atendimento e mostre que o estado muda para Humano. Uma nota interna fica na conversa sem ser enfileirada para o WhatsApp.
4. **Emergência:** abra a conversa em vermelho no topo da lista e mostre o texto fixo, a prioridade e a tarefa para o suporte.
5. **Funil:** filtre e procure oportunidades. Use o menu do cartão ou arraste para outra etapa. Venda confirmada pede evidência; Perdido pede motivo. As mudanças são gravadas na base.
6. **Contatos:** busque uma pessoa, consulte a ficha e abra a conversa correspondente. A exportação gera um CSV dos contatos exibidos.
7. **Propostas:** crie um rascunho e visualize a proposta. Simular envio e Simular aceite mudam somente a prévia nesta página. Nenhum PDF ou mensagem é enviado.
8. **Recuperação:** percorra os seis passos, revise o texto e execute a simulação. O resultado deixa explícito que houve zero envios reais.
9. **Automações:** alterne regras e abra Ver funcionamento. São exemplos visuais; nenhum acompanhamento é agendado.
10. **Agente de IA:** veja a lista de agentes e a configuração do agente comercial. Autonomia, horário de atendimento e emojis ainda abrem o aviso de recurso em desenvolvimento; regras de transferência e respostas a objeções ficam só na tela. Na aba Regras e catálogo, os produtos, preços e perguntas frequentes são reais e o agente usa só o que estiver aprovado.
11. **Conexões e equipe:** veja números reais, números fictícios, equipe de demonstração e simulador. A restauração por botão está desativada para preservar os dados existentes.

## Demonstração do WhatsApp real

1. Em Conexões e equipe → Números, clique em Exibir QR de pareamento no número Comercial.
2. No celular do número comercial, abra WhatsApp → Aparelhos conectados → Conectar um aparelho e escaneie o QR.
3. Aguarde Conectado. Se o QR não aparecer, consulte novamente; se houver falha, confirme que o Evolution está rodando no Docker.
4. Com `DEMO_MODE=true`, inclua o telefone de teste em Conexões e equipe → Ambiente de demonstração → Números permitidos. Use o formato `+55` seguido de DDD e número. Salvar a lista não envia mensagens.
5. Pelo telefone de teste, envie uma mensagem ao número comercial, por exemplo "Oi, quanto custa o plano de vocês?". Ela deve aparecer em Atendimento.
6. No painel, abra a conversa, escreva a resposta e clique em Enviar. Se necessário, confirme Enviar e assumir. Confira os estados de envio e a chegada no celular.
7. Novo atendimento abre uma conversa por telefone, sem enviar nada automaticamente.

Com `ANTHROPIC_API_KEY` definida, o agente de IA responde aos números da lista de permitidos. Sem a chave, contatos fictícios podem usar um roteiro local de demonstração, sem modelo de linguagem. Fora da lista permitida, o modo de demonstração simula a saída e não envia pelo canal real.

Para testar os protocolos fixos pelo telefone de teste: "socorro, acabaram de assaltar a loja" leva ao texto de emergência e à transferência; "podem parar de me mandar mensagem" registra a interrupção.

## Verificação reproduzível

Com API, worker, painel e banco rodando:

```text
pnpm typecheck
pnpm test
pnpm test:prototype
pnpm lint
pnpm verify:prototype
```

`verify:prototype` usa Playwright, lê o usuário local sem imprimir a senha, percorre as telas, verifica interações de demonstração e o layout de celular e grava imagens em `.superpowers/prototipo-verificacao/` (ignorado pelo Git). Não testa disparos externos. Se não houver Chromium instalado, execute `pnpm exec playwright install chromium`.

Para também verificar o simulador com as filas e o worker ativos: `node scripts/verificar-prototipo.mjs --simulate`. Essa opção cria e remove somente um contato fictício de verificação, aguarda a resposta do roteiro de demonstração chegar a lida e confere que não houve identificador de envio externo.

`test:prototype` seleciona explicitamente os testes de integração desta entrega. A suíte do gerador, que substitui a base fictícia, só deve rodar em banco dedicado e fica bloqueada no banco `saleshub` da apresentação.

## Limites desta entrega

- Recebimento e envio de **texto** passam pelo webhook e pelas filas reais. Mídia, transcrição e documentos não foram integrados.
- O pareamento e a validação final no celular dependem do aparelho de quem apresenta.
- Assistente, propostas, recuperação, automações e configurações do agente (exceto o catálogo) são experiências de demonstração. Não geram contratos, campanhas nem envios. Na recuperação, só a geração de variações de texto pode chamar o modelo, quando há chave.
- Preferências de propostas e da configuração do agente (exceto o catálogo) não são gravadas; as regras de automações ficam só no navegador. Conversas, notas, catálogo e movimentos do funil ficam no banco local.
