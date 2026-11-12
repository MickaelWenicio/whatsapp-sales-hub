import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ehNumeroFicticio, TEXTO_EMERGENCIA, TEXTO_INTERRUPCAO } from '@sales-hub/shared';
import {
  INCLUDE_CONVERSA_ITEM,
  paraConversaItemDTO,
  paraTrilhaAcaoDTO,
  SETOR_EMERGENCIA,
} from '../../common/mapeadores';
import { PrismaService } from '../../prisma/prisma.service';
import { OutboundService } from '../outbound/outbound.service';
import { EventosService } from '../realtime/eventos.service';
import { SettingsService } from '../security/settings.service';
import type { Orquestrador, ResultadoTurno, SinaisTurno } from './orquestrador.token';

const INCLUDE_DEMO = {
  contact: { include: { consentimento: true, itens: true } },
  mensagens: {
    where: { tipo: 'texto' },
    orderBy: [{ criadaEm: 'desc' }, { id: 'desc' }],
    take: 30,
  },
} satisfies Prisma.ConversationInclude;
const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/** Local scripted demonstration. No model/client/channel API exists in this implementation. */
@Injectable()
export class OrquestradorDemo implements Orquestrador {
  private readonly logger = new Logger(OrquestradorDemo.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly saida: OutboundService,
    private readonly eventos: EventosService,
    private readonly config: ConfigService,
  ) {}

  async processar(id: string, sinais: SinaisTurno): Promise<ResultadoTurno> {
    const demo = this.config.get<unknown>('DEMO_MODE');
    if (demo !== true && demo !== 'true' && demo !== '1') return 'ignorado';
    const conv = await this.prisma.conversation.findUnique({
      where: { id },
      include: INCLUDE_DEMO,
    });
    if (
      !conv ||
      !ehNumeroFicticio(conv.contact.e164) ||
      conv.estado !== 'IA_ATIVA' ||
      !(await this.settings.iaGlobalAtiva())
    )
      return 'ignorado';
    const origem = conv.mensagens[0];
    if (!origem || origem.autor !== 'cliente') return 'ignorado';
    if (conv.contact.consentimento?.status === 'revogado' && !sinais.interrupcao) return 'ignorado';

    const entradas = conv.mensagens.filter((m) => m.autor === 'cliente' && m.texto).reverse();
    const historico = normalizar(entradas.map((m) => m.texto).join(' '));
    // Plano Completo e Soluções para Empresas são sob cotação; o Plano Essencial tem preço aprovado.
    const cotacao = /\b(completo|empresas?|equipe|cotacao|orcamento)\b/.test(historico);
    const essencial = /\b(essencial|planos?|preco|valor|quanto)\b/.test(historico);
    const temItem =
      conv.contact.itens.length > 0 ||
      /\b(pra|para) (a |o )?(minha|meu|nossa|nosso)\b|\b\d+\s*(pessoas|unidades|usuarios|funcionarios|lojas)\b/.test(
        historico,
      );
    const temCidade =
      !!conv.contact.cidade ||
      /\b(moro em|sou de|minha cidade|cidade de|cidade e)\s+\S+/.test(historico);
    const pergunta = !temItem
      ? 'É para você ou para uma empresa, e para quantas pessoas?'
      : !temCidade
        ? 'Em qual cidade você está?'
        : 'Você prefere seguir com o Plano Essencial, o Plano Completo ou as Soluções para Empresas? Um consultor confirma as condições.';
    const contexto = cotacao
      ? 'Para o Plano Completo e as Soluções para Empresas, a proposta é sob cotação e depende do que você precisa.'
      : essencial
        ? 'Nesta demonstração, o Plano Essencial aparece a partir de R$ 69,90/mês. A equipe confirma valores e condições antes da contratação.'
        : 'Olá! Posso mostrar como funcionam os nossos planos nesta demonstração.';
    const texto = `${contexto} ${pergunta}`;
    const escalado = sinais.interrupcao || sinais.emergencia;
    const justificativa =
      'Roteiro determinístico de demonstração local, sem modelo de linguagem; somente dados das mensagens do contato fictício.';
    const agora = new Date();

    // Same conversation lock as human control: never overwrite an intervening takeover.
    const prepared = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${id} FOR UPDATE`;
      const atual = await tx.conversation.findUnique({ where: { id }, include: { contact: true } });
      const global = await tx.systemSetting.findUnique({ where: { chave: 'iaGlobalAtiva' } });
      if (
        !atual ||
        atual.estado !== 'IA_ATIVA' ||
        atual.versaoControle !== conv.versaoControle ||
        global?.valor === false ||
        !ehNumeroFicticio(atual.contact.e164)
      )
        return null;
      const turn = await tx.agentTurn.create({
        data: {
          conversationId: id,
          iniciadoEm: agora,
          modelo: 'demonstracao-local-sem-llm',
          versaoControle: atual.versaoControle,
          usage: { input_tokens: 0, output_tokens: 0, demonstracao: true },
        },
      });
      if (sinais.interrupcao) {
        const consent = { status: 'revogado' as const, mensagemOrigemId: origem.id, em: agora };
        await tx.consent.upsert({
          where: { contactId: conv.contactId },
          create: { contactId: conv.contactId, ...consent },
          update: consent,
        });
      }
      if (escalado) {
        const setor = sinais.interrupcao
          ? null
          : await tx.sector.findFirst({ where: { nome: SETOR_EMERGENCIA }, select: { id: true } });
        await tx.conversation.update({
          where: { id },
          data: {
            estado: sinais.interrupcao ? 'IA_PAUSADA' : 'AGUARDANDO_ESPECIALISTA',
            responsavelId: null,
            versaoControle: { increment: 1 },
            ...(sinais.emergencia
              ? { prioridade: 'emergencia', ...(setor ? { setorId: setor.id } : {}) }
              : {}),
          },
        });
        await tx.message.create({
          data: {
            conversationId: id,
            numeroId: conv.numeroId,
            autor: 'sistema',
            tipo: 'evento',
            texto: sinais.interrupcao
              ? 'Demonstração: pedido de interrupção registrado; automação pausada.'
              : 'Demonstração: emergência encaminhada para a equipe de suporte.',
          },
        });
      }
      const summary = {
        querOQue: `Demonstração automática: ${sinais.interrupcao ? 'pedido para interromper mensagens' : sinais.emergencia ? 'emergência' : cotacao ? 'interesse em proposta sob cotação' : essencial ? 'interesse no Plano Essencial' : 'interesse a esclarecer'}`,
        jaInformou: entradas.slice(-8).map((m) => m.texto!),
        objecao: null,
        proximoPasso: sinais.interrupcao
          ? 'Automação pausada; respeitar a restrição de contato.'
          : sinais.emergencia
            ? 'Equipe humana deve acompanhar a emergência.'
            : pergunta,
        ultimaMensagemId: origem.id,
        atualizadoEm: agora,
      };
      await tx.conversationSummary.upsert({
        where: { conversationId: id },
        create: { conversationId: id, ...summary },
        update: summary,
      });
      return turn;
    });
    if (!prepared) return 'ignorado';

    await this.eventos.publicar('summary.updated', { conversationId: id }).catch(() => undefined);
    await this.eventos
      .publicar('agent.typing', { conversationId: id, ativo: true })
      .catch(() => undefined);
    let resultado: ResultadoTurno = escalado ? 'escalado' : 'respondido';
    try {
      const ids =
        sinais.interrupcao || sinais.emergencia
          ? [
              await this.saida.criarMensagemSistema({
                conversationId: id,
                texto: sinais.interrupcao ? TEXTO_INTERRUPCAO : TEXTO_EMERGENCIA,
                confirmadoRestrito: sinais.interrupcao,
              }),
            ]
          : await this.saida.criarBolhasIa({
              conversationId: id,
              textos: [texto],
              agentTurnId: prepared.id,
              versao: conv.versaoControle,
            });
      if (!ids.length) resultado = 'ignorado';
      const action = await this.prisma.agentAction.create({
        data: {
          conversationId: id,
          agentTurnId: prepared.id,
          ferramenta: sinais.interrupcao
            ? 'registrar_interrupcao'
            : sinais.emergencia
              ? 'sinalizar_emergencia'
              : 'responder',
          entrada: { demonstracao: true },
          resultado: { mensagemIds: ids },
          justificativa,
          mensagemOrigemId: origem.id,
          status: ids.length ? 'aplicada' : 'descartada',
        },
      });
      await this.eventos
        .publicar('agent.action', { conversationId: id, item: paraTrilhaAcaoDTO(action) })
        .catch(() => undefined);
      const atual = await this.prisma.conversation.findUnique({
        where: { id },
        include: INCLUDE_CONVERSA_ITEM,
      });
      if (atual)
        await this.eventos
          .publicar('conversation.updated', { conversa: paraConversaItemDTO(atual) })
          .catch(() => undefined);
    } catch {
      resultado = 'falhou';
      this.logger.warn('Falha no roteiro local de demonstração');
    } finally {
      await this.prisma.agentTurn.update({
        where: { id: prepared.id },
        data: {
          finalizadoEm: new Date(),
          resultado:
            resultado === 'falhou' ? 'falha' : resultado === 'ignorado' ? 'abortado' : 'ok',
        },
      });
      await this.eventos
        .publicar('agent.typing', { conversationId: id, ativo: false })
        .catch(() => undefined);
    }
    return resultado;
  }
}
