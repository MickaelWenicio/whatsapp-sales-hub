import type Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AgentAction, Prisma, StatusAcaoAgente } from '@prisma/client';
import { mesmoNumero, TEXTO_CONTINGENCIA } from '@sales-hub/shared';
import { INCLUDE_CONVERSA_ITEM, paraConversaItemDTO, paraMensagemDTO, paraTrilhaItemDTO } from '../../common/mapeadores';
import { getAgentConfig, getEmpresaConfig } from '../../config/claude';
import { PrismaService } from '../../prisma/prisma.service';
import type { SinaisTurno } from '../inbound/orquestrador.token';
import { OutboundService } from '../outbound/outbound.service';
import { EventosService } from '../realtime/eventos.service';
import { SettingsService } from '../security/settings.service';
import { AGENTE_LLM, type AgenteLLM, type ResultadoTurnoAgente } from './llm.types';
import { montarEstado } from './prompt/estado';
import { montarPromptEstavel } from './prompt/estavel';
import { ResumoService } from './resumo.service';
import { controleMudou, publicar, type ContextoTurno } from './tools/contexto';
import { definicoesFerramentas, FERRAMENTAS, ehFerramenta } from './tools/definicoes';
import { Dispatcher } from './tools/dispatcher';
import { SegurancaTools } from './tools/seguranca.tools';

type BetaMessage = Anthropic.Beta.BetaMessage;
type BetaMessageParam = Anthropic.Beta.BetaMessageParam;
type BetaToolUseBlock = Anthropic.Beta.BetaToolUseBlock;
type BetaToolResultBlockParam = Anthropic.Beta.BetaToolResultBlockParam;

const MAX_ITERACOES = 8;
const MAX_BLOQUEIOS = 2;
const CACHE_CATALOGO_MS = 5_000;
const CONTINGENCIA_JANELA_MS = 30 * 60_000;
export const JUSTIFICATIVA_DESCARTE = 'Resposta descartada: atendimento assumido';

interface Uso {
  modelo: string;
  stop_reason: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

/**
 * Orquestrador do agente comercial (spec §9). Laço de até 8 iterações com o Claude; o modelo
 * propõe, as ferramentas decidem. Garantia de parada (§8.3 item 4): antes de cada ferramenta (todas
 * escrevem) relê estado/versão; se mudou, descarta o resto, cancela as pendentes e devolve
 * `abortado`. A trava Redis do turno é do AgentTurnProcessor.
 */
@Injectable()
export class Orquestrador {
  private readonly logger = new Logger(Orquestrador.name);
  private catalogo: { em: number; texto: string } | null = null;

  constructor(
    @Inject(AGENTE_LLM) private readonly llm: AgenteLLM,
    private readonly prisma: PrismaService,
    private readonly dispatcher: Dispatcher,
    private readonly seguranca: SegurancaTools,
    private readonly saida: OutboundService,
    private readonly settings: SettingsService,
    private readonly eventos: EventosService,
    private readonly config: ConfigService,
    private readonly resumo: ResumoService,
  ) {}

  async processar(conversationId: string, sinais: SinaisTurno): Promise<ResultadoTurnoAgente> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { contact: { include: { consentimento: true } } },
    });
    if (!conv || conv.estado !== 'IA_ATIVA' || !(await this.settings.iaGlobalAtiva())) return 'ignorado';
    // A IA atende só os números permitidos; os demais ficam para uma pessoa no painel.
    const permitidos = await this.settings.numerosPermitidos();
    if (!permitidos.some((n) => mesmoNumero(n, conv.contact.e164))) return 'ignorado';
    // Contato que pediu para parar: nada automático sai (só emergência segue).
    if (conv.contact.consentimento?.status === 'revogado' && !sinais.emergencia) return 'ignorado';

    const { model, historicoMax } = getAgentConfig(this.config);
    const turno = await this.prisma.agentTurn.create({
      data: { conversationId, iniciadoEm: new Date(), modelo: model, versaoControle: conv.versaoControle },
    });
    await publicar(this.eventos, 'agent.typing', { conversationId, ativo: true });
    const usos: Uso[] = [];
    let resultado: ResultadoTurnoAgente = 'falha';
    let erro: string | null = null;
    try {
      resultado = await this.turno(conversationId, conv.contactId, conv.versaoControle, turno.id, sinais, historicoMax, usos);
      return resultado;
    } catch (e) {
      erro = (e as Error).message;
      this.logger.error(`turno ${conversationId} falhou: ${erro}`);
      resultado = 'falha';
      return resultado;
    } finally {
      const total = usos.reduce(
        (t, u) => ({
          input_tokens: t.input_tokens + u.input_tokens,
          output_tokens: t.output_tokens + u.output_tokens,
          cache_creation_input_tokens: t.cache_creation_input_tokens + u.cache_creation_input_tokens,
          cache_read_input_tokens: t.cache_read_input_tokens + u.cache_read_input_tokens,
        }),
        { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      );
      const modelos = [...new Set(usos.map((u) => u.modelo))];
      await this.prisma.agentTurn
        .update({
          where: { id: turno.id },
          data: {
            finalizadoEm: new Date(),
            resultado,
            erro,
            modelo: modelos.length ? modelos.join(',') : model,
            usage: { total, chamadas: usos } as unknown as Prisma.InputJsonValue,
          },
        })
        .catch((e) => this.logger.warn(`AgentTurn ${turno.id}: ${(e as Error).message}`));
      await publicar(this.eventos, 'agent.typing', { conversationId, ativo: false });
      this.logger.log(`turno ${conversationId}: ${resultado}`);
    }
  }

  private async turno(
    conversationId: string,
    contactId: string,
    versao: number,
    agentTurnId: string,
    sinais: SinaisTurno,
    historicoMax: number,
    usos: Uso[],
  ): Promise<ResultadoTurnoAgente> {
    const historico = await this.historico(conversationId, historicoMax);
    if (!historico) return 'ignorado';
    const ctx: ContextoTurno = {
      conversationId,
      contactId,
      mensagemOrigemId: historico.ultimaClienteId,
      agentTurnId,
      versao,
      bolhasIds: [],
      bloqueios: 0,
    };
    const messages: BetaMessageParam[] = [
      ...historico.messages,
      { role: 'system', content: await montarEstado(this.prisma, conversationId, sinais) },
    ];
    const system: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: 'text', text: await this.promptEstavel(), cache_control: { type: 'ephemeral' } },
    ];
    const tools = definicoesFerramentas();
    let chamouEmergencia = false;
    let algoMudou = false;
    const justificativas: string[] = [];

    for (let i = 0; i < MAX_ITERACOES; i++) {
      if (await controleMudou(this.prisma, ctx)) return this.abortar(ctx, []);
      let r: BetaMessage;
      try {
        r = await this.llm.responder({ system, messages, tools });
      } catch (e) {
        return this.contingencia(ctx, e as Error);
      }
      usos.push({
        modelo: r.model,
        stop_reason: r.stop_reason,
        input_tokens: r.usage?.input_tokens ?? 0,
        output_tokens: r.usage?.output_tokens ?? 0,
        cache_creation_input_tokens: r.usage?.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: r.usage?.cache_read_input_tokens ?? 0,
      });

      // Recusa pode cortar um tool_use no meio: nunca executa as ferramentas desse turno.
      if (r.stop_reason === 'refusal') {
        await this.transferirComSeguranca(ctx, 'A IA não pôde responder a esta mensagem (recusa do modelo).');
        return 'recusa';
      }
      const { usos: ferramentas, textos } = this.blocos(r);
      if (await controleMudou(this.prisma, ctx)) return this.abortar(ctx, ferramentas);
      // Entrada truncada por max_tokens costuma parecer um objeto válido: não executa.
      if (r.stop_reason === 'max_tokens') {
        await this.transferirComSeguranca(ctx, 'A resposta da IA foi interrompida (limite de tokens).');
        return 'falha';
      }
      if (r.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: this.eco(r) });
        continue;
      }
      const textoSolto = textos.join('\n').trim();
      if (textoSolto) {
        await this.registrar(ctx, 'texto_ignorado', { texto: textoSolto }, null, 'descartada', 'Texto fora da ferramenta responder: não enviado ao cliente');
      }
      if (ferramentas.length === 0) {
        await this.fimDoTurno(ctx, sinais, chamouEmergencia, justificativas, algoMudou);
        return 'ok';
      }

      messages.push({ role: 'assistant', content: this.eco(r) });
      // Emergência e interrupção rodam sozinhas: "só o texto fixo e mais nada".
      const prioritaria = ferramentas.find((f) => f.name === 'sinalizar_emergencia') ?? ferramentas.find((f) => f.name === 'registrar_interrupcao');
      const resultados: BetaToolResultBlockParam[] = [];
      let encerrado = false;
      for (const [k, uso] of ferramentas.entries()) {
        const entrada = uso.input as Record<string, unknown>;
        const just = typeof entrada?.justificativa === 'string' ? entrada.justificativa.slice(0, 200) : null;
        if (encerrado || (prioritaria && uso !== prioritaria)) {
          await this.registrar(ctx, uso.name, entrada, null, 'descartada', prioritaria ? `Descartada: ${prioritaria.name} encerra o turno` : 'Descartada: o turno foi encerrado');
          // todo tool_use precisa de um tool_result na próxima requisição (senão a API responde 400)
          resultados.push({ type: 'tool_result', tool_use_id: uso.id, is_error: true, content: 'descartado' });
          continue;
        }
        if (await controleMudou(this.prisma, ctx)) return this.abortar(ctx, ferramentas.slice(k));
        const res = await this.dispatcher.executar(ctx, uso.name, entrada);
        if (res.abortado) return this.abortar(ctx, ferramentas.slice(k));
        await this.registrar(ctx, uso.name, entrada, res.ok ? (res.resultado ?? null) : { erro: res.erro }, res.ok ? 'aplicada' : 'recusada', just);
        if (res.ok) {
          if (just) justificativas.push(just);
          if (uso.name !== 'responder') algoMudou = true;
          if (uso.name === 'sinalizar_emergencia') chamouEmergencia = true;
        }
        if (res.bloqueio) {
          ctx.bloqueios += 1;
          if (ctx.bloqueios >= MAX_BLOQUEIOS) {
            await this.transferirComSeguranca(ctx, 'Duas respostas da IA foram bloqueadas pelo filtro de saída.');
            return 'ok';
          }
        }
        if (res.ok && ehFerramenta(uso.name) && FERRAMENTAS[uso.name].terminal) encerrado = true;
        resultados.push({
          type: 'tool_result',
          tool_use_id: uso.id,
          content: JSON.stringify(res.ok ? (res.resultado ?? { ok: true }) : { erro: res.erro }),
          ...(res.ok ? {} : { is_error: true }),
        });
      }
      if (encerrado) {
        await this.fimDoTurno(ctx, sinais, chamouEmergencia, justificativas, algoMudou);
        return 'ok';
      }
      messages.push({ role: 'user', content: resultados });
    }
    this.logger.warn(`turno ${conversationId}: ${MAX_ITERACOES} iterações sem encerrar`);
    await this.transferirComSeguranca(ctx, `A IA não concluiu o turno em ${MAX_ITERACOES} iterações.`);
    return 'falha';
  }

  /** Últimas N mensagens cliente|ia|atendente (sem notas/eventos/canceladas); começa e termina em user. */
  private async historico(
    conversationId: string,
    max: number,
  ): Promise<{ messages: BetaMessageParam[]; ultimaClienteId: string } | null> {
    const msgs = (
      await this.prisma.message.findMany({
        where: {
          conversationId,
          autor: { in: ['cliente', 'ia', 'atendente'] },
          tipo: { notIn: ['nota_interna', 'evento'] },
          texto: { not: null },
          OR: [{ status: null }, { status: { notIn: ['cancelada', 'falhou'] } }],
        },
        orderBy: [{ criadaEm: 'desc' }, { id: 'desc' }],
        take: max,
        include: { autorUsuario: { select: { nome: true } } },
      })
    ).reverse();
    const ultima = msgs.at(-1);
    if (!ultima || ultima.autor !== 'cliente') return null;
    const out: Array<{ role: 'user' | 'assistant'; content: Anthropic.Beta.BetaTextBlockParam[] }> = [];
    for (const m of msgs) {
      const role = m.autor === 'cliente' ? 'user' : 'assistant';
      const text = m.autor === 'atendente' ? `[Atendente ${m.autorUsuario?.nome ?? 'da equipe'}] ${m.texto}` : m.texto!;
      const ant = out.at(-1);
      if (ant && ant.role === role) ant.content.push({ type: 'text', text });
      else out.push({ role, content: [{ type: 'text', text }] });
    }
    while (out[0]?.role === 'assistant') out.shift();
    return { messages: out, ultimaClienteId: ultima.id };
  }

  /** Catálogo aprovado do banco, com cache de até 5 s (o painel edita). */
  private async promptEstavel(): Promise<string> {
    if (this.catalogo && Date.now() - this.catalogo.em < CACHE_CATALOGO_MS) return this.catalogo.texto;
    const [produtos, precos, faqs, emojis] = await Promise.all([
      this.prisma.product.findMany({ where: { aprovado: true } }),
      this.prisma.priceRule.findMany({ where: { aprovado: true } }),
      this.prisma.faq.findMany({ where: { aprovado: true } }),
      this.prisma.systemSetting.findUnique({ where: { chave: 'emojisModerados' } }),
    ]);
    const empresa = getEmpresaConfig(this.config);
    const texto = montarPromptEstavel(
      { produtos, precos, faqs },
      {
        emojisModerados: emojis?.valor !== false,
        empresaNome: empresa.nome,
        empresaDescricao: empresa.descricao,
        termosProibidos: empresa.termosProibidos,
      },
    );
    this.catalogo = { em: Date.now(), texto };
    return texto;
  }

  /** Blocos executáveis: só os que vêm depois do último `fallback` (o trecho recusado não roda). */
  private blocos(r: BetaMessage): { usos: BetaToolUseBlock[]; textos: string[] } {
    const corte = r.content.map((b) => b.type).lastIndexOf('fallback');
    const depois = r.content.slice(corte + 1);
    return {
      usos: depois.filter((b): b is BetaToolUseBlock => b.type === 'tool_use'),
      textos: depois.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text),
    };
  }

  /** Conteúdo do assistant devolvido no histórico, sem thinking/tool_use anteriores ao último `fallback`. */
  private eco(r: BetaMessage): Anthropic.Beta.BetaContentBlockParam[] {
    const corte = r.content.map((b) => b.type).lastIndexOf('fallback');
    return r.content.filter(
      (b, i) => i >= corte || b.type === 'text',
    ) as unknown as Anthropic.Beta.BetaContentBlockParam[];
  }

  private async registrar(
    ctx: ContextoTurno,
    ferramenta: string,
    entrada: unknown,
    resultado: unknown,
    status: StatusAcaoAgente,
    justificativa: string | null,
  ): Promise<AgentAction> {
    const acao = await this.prisma.agentAction.create({
      data: {
        agentTurnId: ctx.agentTurnId,
        conversationId: ctx.conversationId,
        ferramenta,
        entrada: (entrada ?? {}) as Prisma.InputJsonValue,
        resultado: resultado === null || resultado === undefined ? undefined : (resultado as Prisma.InputJsonValue),
        justificativa,
        mensagemOrigemId: ctx.mensagemOrigemId,
        status,
      },
    });
    await publicar(this.eventos, 'agent.action', { conversationId: ctx.conversationId, item: paraTrilhaItemDTO(acao) });
    return acao;
  }

  /** Garantia de parada: descarta o que o turno gerou e cancela as pendentes. */
  private async abortar(ctx: ContextoTurno, restantes: BetaToolUseBlock[]): Promise<'abortado'> {
    for (const u of restantes) await this.registrar(ctx, u.name, u.input, null, 'descartada', JUSTIFICATIVA_DESCARTE);
    await this.saida.cancelarAutomaticasPendentes(ctx.conversationId, JUSTIFICATIVA_DESCARTE).catch(() => 0);
    return 'abortado';
  }

  /** Erro da API depois das novas tentativas do SDK: contingência (1x por 30 min) + transferência. */
  private async contingencia(ctx: ContextoTurno, e: Error): Promise<ResultadoTurnoAgente> {
    this.logger.error(`erro do Claude em ${ctx.conversationId}: ${e.message}`);
    const recente = await this.prisma.message.count({
      where: {
        conversationId: ctx.conversationId,
        autor: 'sistema',
        texto: TEXTO_CONTINGENCIA,
        criadaEm: { gte: new Date(Date.now() - CONTINGENCIA_JANELA_MS) },
      },
    });
    // garantia de parada antes de escrever: se uma pessoa já assumiu, nada sai
    if (await controleMudou(this.prisma, ctx)) return this.abortar(ctx, []);
    if (!recente) {
      // sem `versao`: a transferência logo abaixo incrementa a versão e não pode cancelá-la
      await this.saida.criarMensagemSistema({ conversationId: ctx.conversationId, texto: TEXTO_CONTINGENCIA });
    }
    await this.prisma.conversation.update({ where: { id: ctx.conversationId }, data: { iaFalhouEm: new Date() } }).catch(() => undefined);
    const ok = await this.transferirComSeguranca(ctx, `Falha técnica da IA: ${e.message}`.slice(0, 300));
    return ok ? 'falha' : 'abortado';
  }

  private async transferirComSeguranca(ctx: ContextoTurno, motivo: string, aguardar?: string[]): Promise<boolean> {
    try {
      return await this.seguranca.transferir(ctx, motivo, 'Comercial', aguardar);
    } catch (e) {
      this.logger.error(`transferência de ${ctx.conversationId} falhou: ${(e as Error).message}`);
      return false;
    }
  }

  /** Fim normal: emergência descartada pela IA (prioridade volta ao normal) e resumo se algo mudou. */
  private async fimDoTurno(
    ctx: ContextoTurno,
    sinais: SinaisTurno,
    chamouEmergencia: boolean,
    justificativas: string[],
    algoMudou: boolean,
  ): Promise<void> {
    if (sinais.emergencia && !chamouEmergencia) {
      const c = await this.prisma.conversation.findUniqueOrThrow({ where: { id: ctx.conversationId } });
      if (c.prioridade === 'emergencia') {
        const conv = await this.prisma.conversation.update({
          where: { id: c.id },
          data: { prioridade: 'normal' },
          include: INCLUDE_CONVERSA_ITEM,
        });
        const motivo = justificativas.at(-1) ?? 'sem justificativa';
        const ev = await this.prisma.message.create({
          data: {
            conversationId: c.id,
            numeroId: c.numeroId,
            autor: 'sistema',
            tipo: 'evento',
            texto: `Possível emergência descartada pela IA: ${motivo}`,
          },
        });
        await publicar(this.eventos, 'conversation.updated', { conversa: paraConversaItemDTO(conv) });
        await publicar(this.eventos, 'message.created', { conversationId: c.id, mensagem: paraMensagemDTO(ev) });
        await publicar(this.eventos, 'agent.action', { conversationId: c.id, item: paraTrilhaItemDTO(ev) });
      }
    }
    if (algoMudou) await this.resumo.enfileirar(ctx.conversationId).catch(() => undefined);
  }
}
