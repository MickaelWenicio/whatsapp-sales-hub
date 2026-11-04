import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decidirTurno, preClassificar } from '@sales-hub/shared';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '../../queue/queue.constants';
import { SettingsService } from '../security/settings.service';
import { ORQUESTRADOR, type Orquestrador } from './orquestrador.token';
import { TurnoLockService } from './turno-lock.service';

/** Payload do job `turn` (um por mensagem do cliente; o debounce decide qual roda). */
export interface AgentTurnJob {
  conversationId: string;
  /** Nº de vezes que este job já esbarrou na trava (para o backoff). */
  espera?: number;
}

/** Autores que contam como "resposta" (saída) quando não há marcador de visto. */
const AUTORES_SAIDA = ['ia', 'atendente', 'sistema'] as const;
const LOCK_TTL_MS = 120_000;
const ESPERA_MAX_MS = 15_000;

/**
 * Consome `agent-turn`: turno do agente com debounce por conversa. Cada mensagem do cliente
 * agenda um job com atraso = AGENT_DEBOUNCE_MS; ao disparar, `decidirTurno` deixa rodar só o
 * job da última mensagem da rajada (ou o que bater no teto). Trava Redis (com dono e renovação)
 * garante um turno por conversa. O que o turno já viu fica num marcador; mensagens posteriores
 * a ele (chegadas durante o turno) disparam um novo turno ao final.
 */
@Processor(QUEUES.AGENT_TURN, { concurrency: 4 })
export class AgentTurnProcessor extends WorkerHost {
  private readonly logger = new Logger(AgentTurnProcessor.name);
  private readonly debounceMs: number;
  private readonly maxEsperaMs: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ORQUESTRADOR) private readonly orquestrador: Orquestrador,
    private readonly lock: TurnoLockService,
    @InjectQueue(QUEUES.AGENT_TURN) private readonly fila: Queue<AgentTurnJob>,
    private readonly settings: SettingsService,
    config: ConfigService,
  ) {
    super();
    this.debounceMs = config.get<number>('AGENT_DEBOUNCE_MS') ?? 3000;
    this.maxEsperaMs = config.get<number>('AGENT_DEBOUNCE_MAX_MS') ?? 20_000;
  }

  async process(job: Job<AgentTurnJob>): Promise<void> {
    const { conversationId } = job.data;

    const token = await this.lock.adquirir(conversationId, LOCK_TTL_MS);
    if (!token) {
      // Turno em andamento: espera com backoff. O jobId por nível deduplica as esperas
      // concorrentes (várias mensagens da rajada viram um único job por nível).
      const n = (job.data.espera ?? 0) + 1;
      const delay = Math.min(this.debounceMs * 2 ** (n - 1), ESPERA_MAX_MS);
      // O id da última mensagem do cliente discrimina a rajada: o dedup vale dentro dela, e um
      // job concluído/falho retido de uma rajada anterior não recusa a espera desta.
      const ultima = await this.prisma.message.findFirst({
        where: { conversationId, autor: 'cliente' },
        orderBy: { criadaEm: 'desc' },
        select: { id: true },
      });
      await this.fila.add(
        'turn',
        { conversationId, espera: n },
        { delay, jobId: `turn.${conversationId}.espera.${ultima?.id ?? 'x'}.${n}` },
      );
      this.logger.debug(`turno ${conversationId} em andamento: espera ${n} (${delay} ms)`);
      return;
    }

    // Renova a trava enquanto o turno roda (só enquanto ainda formos donos).
    const renovacao = setInterval(() => {
      this.lock.renovar(conversationId, token, LOCK_TTL_MS).catch(() => undefined);
    }, LOCK_TTL_MS / 3);
    renovacao.unref?.();

    let vistoAte: number | null = null; // só definido quando o turno concluiu com sucesso
    try {
      const avaliacao = await this.avaliar(conversationId);
      if (!avaliacao) return;
      const resultado = await this.orquestrador.processar(conversationId, avaliacao.sinais);
      // O marcador só avança depois de processar: se o orquestrador lançar, o retry do BullMQ
      // ainda enxerga as mensagens como não vistas.
      await this.lock.marcarVisto(conversationId, avaliacao.vistoAte);
      vistoAte = avaliacao.vistoAte;
      this.logger.log(`turno ${conversationId}: ${resultado}`);
    } finally {
      clearInterval(renovacao);
      await this.lock.liberar(conversationId, token);
      if (vistoAte != null) await this.reagendarSeHouverNovas(conversationId, vistoAte);
    }
  }

  /** Mensagens do cliente posteriores ao marcador (chegaram durante o turno) pedem outro turno. */
  private async reagendarSeHouverNovas(conversationId: string, visto: number): Promise<void> {
    try {
      const conversa = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { estado: true },
      });
      if (conversa?.estado !== 'IA_ATIVA') return;
      const nova = await this.prisma.message.findFirst({
        where: { conversationId, autor: 'cliente', tipo: { not: 'figurinha' }, criadaEm: { gt: new Date(visto) } },
        select: { criadaEm: true },
      });
      if (!nova) return;
      await this.fila.add(
        'turn',
        { conversationId },
        { delay: this.debounceMs, jobId: `turn.${conversationId}.${Date.now()}` },
      );
    } catch (e) {
      this.logger.warn(`turno ${conversationId}: falha ao reagendar (${(e as Error).message})`);
    }
  }

  /** Decide se o turno roda agora. Devolve sinais e marcador, ou null para não rodar. */
  private async avaliar(
    conversationId: string,
  ): Promise<{ sinais: { emergencia: boolean; interrupcao: boolean }; vistoAte: number } | null> {
    const conversa = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { estado: true },
    });
    // O controle pode ter mudado (humano assumiu, IA desligada) entre o agendamento e agora.
    if (!conversa || conversa.estado !== 'IA_ATIVA' || !(await this.settings.iaGlobalAtiva())) return null;

    // Referência do que já foi tratado = max(marcador do último turno, última resposta humana/
    // do sistema). Respostas da IA não entram: a dela é posterior às mensagens chegadas durante
    // o próprio turno e as esconderia. Sem marcador (expirou/primeiro turno), vale qualquer saída.
    const visto = await this.lock.lerVisto(conversationId);
    const ultimaSaida = await this.prisma.message.findFirst({
      where: {
        conversationId,
        autor: { in: visto == null ? [...AUTORES_SAIDA] : ['atendente', 'sistema'] },
        tipo: 'texto',
      },
      orderBy: { criadaEm: 'desc' },
      select: { criadaEm: true },
    });
    const candidatas = [visto, ultimaSaida?.criadaEm.getTime() ?? null].filter((v): v is number => v != null);
    const referencia = candidatas.length ? Math.max(...candidatas) : null;
    const entradas = await this.prisma.message.findMany({
      where: {
        conversationId,
        autor: 'cliente',
        tipo: { not: 'figurinha' },
        ...(referencia != null ? { criadaEm: { gt: new Date(referencia) } } : {}),
      },
      orderBy: { criadaEm: 'asc' },
      select: { criadaEm: true, texto: true, tipo: true },
    });

    const decisao = decidirTurno({
      agora: Date.now(),
      ultimaEntradaEm: entradas.at(-1)?.criadaEm.getTime() ?? null,
      ultimaSaidaEm: null, // já filtramos por "depois do visto"
      entradaMaisAntigaNaoRespondidaEm: entradas[0]?.criadaEm.getTime() ?? null,
      debounceMs: this.debounceMs,
      maxEsperaMs: this.maxEsperaMs,
    });
    if (decisao !== 'rodar') {
      this.logger.debug(`turno ${conversationId}: ${decisao}`);
      return null;
    }

    const sinais = { emergencia: false, interrupcao: false };
    for (const m of entradas) {
      if (m.tipo !== 'texto' || !m.texto) continue;
      const s = preClassificar(m.texto);
      sinais.emergencia ||= s.emergencia;
      sinais.interrupcao ||= s.interrupcao;
    }
    return { sinais, vistoAte: entradas[entradas.length - 1]!.criadaEm.getTime() };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, err: Error): void {
    this.logger.warn(`agent-turn job ${job?.id} falhou (tentativa ${job?.attemptsMade}): ${err.message}`);
  }
}
