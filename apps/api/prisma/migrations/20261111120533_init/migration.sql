-- Busca (ILIKE) com pg_trgm
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "PapelUsuario" AS ENUM ('dono', 'gestor', 'atendente');

-- CreateEnum
CREATE TYPE "EstadoConversa" AS ENUM ('IA_ATIVA', 'HUMANO', 'IA_PAUSADA', 'AGUARDANDO_ESPECIALISTA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "Prioridade" AS ENUM ('normal', 'alta', 'emergencia');

-- CreateEnum
CREATE TYPE "AutorMensagem" AS ENUM ('cliente', 'ia', 'atendente', 'sistema');

-- CreateEnum
CREATE TYPE "TipoMensagem" AS ENUM ('texto', 'imagem', 'documento', 'audio', 'video', 'figurinha', 'nota_interna', 'evento');

-- CreateEnum
CREATE TYPE "StatusMensagem" AS ENUM ('pendente', 'enviando', 'enviada', 'entregue', 'lida', 'falhou', 'cancelada');

-- CreateEnum
CREATE TYPE "Etapa" AS ENUM ('novo_lead', 'em_atendimento', 'qualificacao_concluida', 'aguardando_cotacao', 'proposta_enviada', 'em_negociacao', 'contratacao_em_andamento', 'venda_confirmada', 'perdido');

-- CreateEnum
CREATE TYPE "Preocupacao" AS ENUM ('preco', 'qualidade', 'prazo', 'suporte', 'outra');

-- CreateEnum
CREATE TYPE "TipoObjecao" AS ENUM ('preco', 'confianca', 'necessidade', 'momento', 'concorrente', 'outro');

-- CreateEnum
CREATE TYPE "OrigemContato" AS ENUM ('whatsapp_organico', 'site', 'campanha', 'indicacao', 'importacao');

-- CreateEnum
CREATE TYPE "StatusCliente" AS ENUM ('lead', 'cliente_ativo', 'ex_cliente');

-- CreateEnum
CREATE TYPE "StatusConsentimento" AS ENUM ('concedido', 'revogado');

-- CreateEnum
CREATE TYPE "TipoTarefa" AS ENUM ('cotacao', 'retorno', 'encaminhar_contratacao', 'pos_venda', 'entrega', 'outro');

-- CreateEnum
CREATE TYPE "StatusTarefa" AS ENUM ('aberta', 'concluida', 'cancelada');

-- CreateEnum
CREATE TYPE "StatusAcaoAgente" AS ENUM ('aplicada', 'sugerida', 'pendente_aprovacao', 'recusada', 'descartada');

-- CreateEnum
CREATE TYPE "TipoAtor" AS ENUM ('ia', 'humano', 'sistema');

-- CreateEnum
CREATE TYPE "EstadoNumero" AS ENUM ('conectado', 'reconectando', 'desconectado');

-- CreateEnum
CREATE TYPE "OrigemDemo" AS ENUM ('seed', 'ao_vivo');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "papel" "PapelUsuario" NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sectors" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_numbers" (
    "id" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "e164" TEXT NOT NULL,
    "instanciaEvolution" TEXT NOT NULL,
    "estado" "EstadoNumero" NOT NULL DEFAULT 'desconectado',
    "ultimoEstadoEm" TIMESTAMP(3),
    "ultimaFalha" TEXT,
    "ficticio" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "whatsapp_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_events" (
    "id" TEXT NOT NULL,
    "idMensagem" TEXT NOT NULL,
    "numeroId" TEXT NOT NULL,
    "resumo" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "nome" TEXT,
    "e164" TEXT NOT NULL,
    "cidade" TEXT,
    "uf" TEXT,
    "origem" "OrigemContato" NOT NULL DEFAULT 'whatsapp_organico',
    "statusCliente" "StatusCliente" NOT NULL DEFAULT 'lead',
    "camposIa" JSONB NOT NULL DEFAULT '{}',
    "origemDemo" "OrigemDemo",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "StatusConsentimento" NOT NULL,
    "mensagemOrigemId" TEXT,
    "em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interest_items" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "categoria" TEXT,
    "descricao" TEXT,
    "quantidade" INTEGER,
    "camposIa" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interest_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "numeroId" TEXT NOT NULL,
    "estado" "EstadoConversa" NOT NULL DEFAULT 'IA_ATIVA',
    "prioridade" "Prioridade" NOT NULL DEFAULT 'normal',
    "responsavelId" TEXT,
    "setorId" TEXT,
    "versaoControle" INTEGER NOT NULL DEFAULT 0,
    "naoLidas" INTEGER NOT NULL DEFAULT 0,
    "ultimaMensagemEm" TIMESTAMP(3),
    "ultimaMensagemClienteEm" TIMESTAMP(3),
    "janelaAteEm" TIMESTAMP(3),
    "iaFalhouEm" TIMESTAMP(3),
    "origemDemo" "OrigemDemo",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_summaries" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "querOQue" TEXT NOT NULL,
    "jaInformou" TEXT[],
    "objecao" TEXT,
    "proximoPasso" TEXT NOT NULL,
    "ultimaMensagemId" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "numeroId" TEXT NOT NULL,
    "autor" "AutorMensagem" NOT NULL,
    "tipo" "TipoMensagem" NOT NULL DEFAULT 'texto',
    "texto" TEXT,
    "status" "StatusMensagem",
    "idExterno" TEXT,
    "motivoFalha" TEXT,
    "autorUsuarioId" TEXT,
    "agentTurnId" TEXT,
    "versaoControle" INTEGER,
    "confirmadoRestrito" BOOLEAN NOT NULL DEFAULT false,
    "citadaId" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_turns" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "iniciadoEm" TIMESTAMP(3) NOT NULL,
    "finalizadoEm" TIMESTAMP(3),
    "modelo" TEXT NOT NULL,
    "versaoControle" INTEGER NOT NULL,
    "resultado" TEXT,
    "erro" TEXT,
    "usage" JSONB,

    CONSTRAINT "agent_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_actions" (
    "id" TEXT NOT NULL,
    "agentTurnId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "ferramenta" TEXT NOT NULL,
    "entrada" JSONB NOT NULL,
    "resultado" JSONB,
    "justificativa" TEXT,
    "mensagemOrigemId" TEXT,
    "status" "StatusAcaoAgente" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "itemId" TEXT,
    "produto" TEXT,
    "etapa" "Etapa" NOT NULL DEFAULT 'novo_lead',
    "etapaDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responsavelId" TEXT,
    "solucaoAtual" TEXT,
    "momentoCompra" TEXT,
    "preocupacao" "Preocupacao",
    "prazoDecisao" TEXT,
    "motivoPerda" TEXT,
    "proximaAcao" TEXT,
    "proximaAcaoEm" TIMESTAMP(3),
    "ultimoContatoClienteEm" TIMESTAMP(3),
    "prioridade" "Prioridade" NOT NULL DEFAULT 'normal',
    "camposIa" JSONB NOT NULL DEFAULT '{}',
    "origemDemo" "OrigemDemo",
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadaEm" TIMESTAMP(3),

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_events" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "de" "Etapa",
    "para" "Etapa" NOT NULL,
    "ator" "TipoAtor" NOT NULL,
    "atorUsuarioId" TEXT,
    "justificativa" TEXT,
    "mensagemOrigemId" TEXT,
    "evidencia" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "objections" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "tipo" "TipoObjecao" NOT NULL,
    "descricao" TEXT NOT NULL,
    "mensagemOrigemId" TEXT,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "objections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "tipo" "TipoTarefa" NOT NULL,
    "titulo" TEXT NOT NULL,
    "opportunityId" TEXT,
    "conversationId" TEXT,
    "responsavelId" TEXT,
    "setorId" TEXT,
    "prazoEm" TIMESTAMP(3),
    "status" "StatusTarefa" NOT NULL DEFAULT 'aberta',
    "checklist" JSONB,
    "origemDemo" "OrigemDemo",
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidaEm" TIMESTAMP(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "beneficios" TEXT[],
    "condicoes" TEXT NOT NULL,
    "aprovado" BOOLEAN NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_rules" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "categoria" TEXT,
    "rotulo" TEXT NOT NULL,
    "valorCentavos" INTEGER,
    "sobCotacao" BOOLEAN NOT NULL,
    "aprovado" BOOLEAN NOT NULL,
    "demonstracao" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faqs" (
    "id" TEXT NOT NULL,
    "pergunta" TEXT NOT NULL,
    "resposta" TEXT NOT NULL,
    "aprovado" BOOLEAN NOT NULL,

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "chave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "atualizadoPor" TEXT,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "ator" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "entidade" TEXT,
    "entidadeId" TEXT,
    "ip" TEXT,
    "hashAnterior" TEXT,
    "hash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sectors_nome_key" ON "sectors"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_numbers_e164_key" ON "whatsapp_numbers"("e164");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_numbers_instanciaEvolution_key" ON "whatsapp_numbers"("instanciaEvolution");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_events_idMensagem_key" ON "inbound_events"("idMensagem");

-- CreateIndex
CREATE INDEX "inbound_events_numeroId_idx" ON "inbound_events"("numeroId");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_e164_key" ON "contacts"("e164");

-- CreateIndex
CREATE INDEX "contacts_nome_trgm_idx" ON "contacts" USING GIN ("nome" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "contacts_e164_trgm_idx" ON "contacts" USING GIN ("e164" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "consents_contactId_key" ON "consents"("contactId");

-- CreateIndex
CREATE INDEX "interest_items_contactId_idx" ON "interest_items"("contactId");

-- CreateIndex
CREATE INDEX "conversations_estado_prioridade_ultimaMensagemEm_idx" ON "conversations"("estado", "prioridade", "ultimaMensagemEm");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_contactId_numeroId_key" ON "conversations"("contactId", "numeroId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_summaries_conversationId_key" ON "conversation_summaries"("conversationId");

-- CreateIndex
CREATE INDEX "messages_conversationId_criadaEm_idx" ON "messages"("conversationId", "criadaEm");

-- CreateIndex
CREATE INDEX "messages_texto_trgm_idx" ON "messages" USING GIN ("texto" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "messages_numeroId_idExterno_key" ON "messages"("numeroId", "idExterno");

-- CreateIndex
CREATE INDEX "agent_turns_conversationId_idx" ON "agent_turns"("conversationId");

-- CreateIndex
CREATE INDEX "agent_actions_agentTurnId_idx" ON "agent_actions"("agentTurnId");

-- CreateIndex
CREATE INDEX "agent_actions_conversationId_idx" ON "agent_actions"("conversationId");

-- CreateIndex
CREATE INDEX "opportunities_etapa_responsavelId_idx" ON "opportunities"("etapa", "responsavelId");

-- CreateIndex
CREATE INDEX "opportunities_contactId_idx" ON "opportunities"("contactId");

-- CreateIndex
CREATE INDEX "opportunity_events_opportunityId_idx" ON "opportunity_events"("opportunityId");

-- CreateIndex
CREATE INDEX "objections_opportunityId_idx" ON "objections"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "price_rules_productId_idx" ON "price_rules"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_seq_key" ON "audit_log"("seq");

-- AddForeignKey
ALTER TABLE "inbound_events" ADD CONSTRAINT "inbound_events_numeroId_fkey" FOREIGN KEY ("numeroId") REFERENCES "whatsapp_numbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interest_items" ADD CONSTRAINT "interest_items_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_numeroId_fkey" FOREIGN KEY ("numeroId") REFERENCES "whatsapp_numbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "sectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_summaries" ADD CONSTRAINT "conversation_summaries_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_numeroId_fkey" FOREIGN KEY ("numeroId") REFERENCES "whatsapp_numbers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_autorUsuarioId_fkey" FOREIGN KEY ("autorUsuarioId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_agentTurnId_fkey" FOREIGN KEY ("agentTurnId") REFERENCES "agent_turns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_agentTurnId_fkey" FOREIGN KEY ("agentTurnId") REFERENCES "agent_turns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "interest_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_events" ADD CONSTRAINT "opportunity_events_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_events" ADD CONSTRAINT "opportunity_events_atorUsuarioId_fkey" FOREIGN KEY ("atorUsuarioId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "objections" ADD CONSTRAINT "objections_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "sectors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

