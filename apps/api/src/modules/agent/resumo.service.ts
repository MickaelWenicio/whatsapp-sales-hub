import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';
import { z } from 'zod';
import { getAgentConfig, getEmpresaConfig } from '../../config/claude';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '../../queue/queue.constants';
import { EventosService } from '../realtime/eventos.service';
import { publicar } from './tools/contexto';

export const ResumoSchema = z.object({
  querOQue: z.string(),
  jaInformou: z.array(z.string()),
  objecao: z.string().nullable(),
  proximoPasso: z.string(),
});
export type Resumo = z.infer<typeof ResumoSchema>;

/** Dados do job em `QUEUES.RESUMO`; jobId = `resumo.<conversationId>.<ultimaMensagemId>`. */
export interface JobResumo {
  conversationId: string;
}

/** Resumo da conversa (spec §8.5): uma chamada com saída estruturada; grava ConversationSummary. */
@Injectable()
export class ResumoService {
  private client?: Anthropic;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: EventosService,
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.RESUMO) private readonly fila: Queue,
  ) {}

  /** Enfileira (dedup pela última mensagem). O processador roda no worker. */
  async enfileirar(conversationId: string): Promise<void> {
    const ultima = await this.prisma.message.findFirst({
      where: { conversationId },
      orderBy: { criadaEm: 'desc' },
      select: { id: true },
    });
    if (!ultima) return;
    await this.fila.add('resumo', { conversationId } satisfies JobResumo, {
      jobId: `resumo.${conversationId}.${ultima.id}`,
      attempts: 2,
    });
  }

  async atualizar(conversationId: string): Promise<void> {
    const msgs = await this.prisma.message.findMany({
      where: { conversationId, tipo: { in: ['texto', 'nota_interna'] }, texto: { not: null } },
      orderBy: { criadaEm: 'desc' },
      take: 40,
      include: { autorUsuario: { select: { nome: true } } },
    });
    if (!msgs.length) return;
    const ultimaMensagemId = msgs[0]!.id;
    const transcricao = msgs
      .reverse()
      .filter((m) => m.status !== 'cancelada' && m.status !== 'falhou')
      .map((m) => {
        const quem =
          m.tipo === 'nota_interna'
            ? 'Nota interna'
            : m.autor === 'cliente'
              ? 'Cliente'
              : m.autor === 'atendente'
                ? `Atendente ${m.autorUsuario?.nome ?? ''}`.trim()
                : m.autor === 'ia'
                  ? 'Assistente'
                  : 'Sistema';
        return `${quem}: ${m.texto}`;
      })
      .join('\n');

    const r = await this.gerar(transcricao);
    const dados = {
      querOQue: r.querOQue,
      jaInformou: r.jaInformou,
      objecao: r.objecao,
      proximoPasso: r.proximoPasso,
      ultimaMensagemId,
      atualizadoEm: new Date(),
    };
    await this.prisma.conversationSummary.upsert({
      where: { conversationId },
      create: { conversationId, ...dados },
      update: dados,
    });
    await publicar(this.eventos, 'summary.updated', { conversationId });
  }

  /** Chamada ao Claude com `output_config.format` (zod). */
  protected async gerar(transcricao: string): Promise<Resumo> {
    const { model } = getAgentConfig(this.config);
    const empresa = getEmpresaConfig(this.config);
    this.client ??= new Anthropic();
    const resp = await this.client.messages.parse({
      model,
      max_tokens: 2000,
      output_config: { effort: 'low', format: zodOutputFormat(ResumoSchema) },
      messages: [
        {
          role: 'user',
          content:
            `Resuma esta conversa de atendimento comercial da ${empresa.nome} para a equipe, em pt-BR, frases curtas. ` +
            'querOQue: o que o cliente quer. jaInformou: fatos que o cliente já informou (o que procura, quantidade, cidade, o que usa hoje, preocupação). ' +
            'objecao: a principal objeção, ou null. proximoPasso: o próximo passo concreto.\n\n' +
            transcricao,
        },
      ],
    }, { signal: AbortSignal.timeout(40_000) });
    if (!resp.parsed_output) throw new Error(`resumo sem saída estruturada (stop_reason ${resp.stop_reason})`);
    return resp.parsed_output;
  }
}

/** Consumidor de `QUEUES.RESUMO` (só no worker). Aceita jobs da API do painel pelo mesmo jobId. */
@Processor(QUEUES.RESUMO, { concurrency: 2 })
export class ResumoProcessor extends WorkerHost {
  private readonly logger = new Logger(ResumoProcessor.name);
  constructor(private readonly resumo: ResumoService) {
    super();
  }

  async process(job: Job<Partial<JobResumo>>): Promise<void> {
    const id = job.data?.conversationId ?? String(job.id ?? '').split('.')[1];
    if (!id) return;
    await this.resumo.atualizar(id);
    this.logger.log(`resumo ${id} atualizado`);
  }
}
