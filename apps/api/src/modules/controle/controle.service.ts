import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Conversation, EstadoConversa, Message, Prisma } from '@prisma/client';
import { mesmoNumero, type EventoTempoReal } from '@sales-hub/shared';
import { INCLUDE_CONVERSA_ITEM, paraConversaItemDTO, paraMensagemDTO } from '../../common/mapeadores';
import { PrismaService } from '../../prisma/prisma.service';
import { CHANNEL_PORT, type ChannelPort } from '../channel/channel.port';
import { OutboundService } from '../outbound/outbound.service';
import { EventosService } from '../realtime/eventos.service';
import { AuditService } from '../security/audit.service';
import { SettingsService } from '../security/settings.service';

/** Ator das ações de controle: id de um `User` ou `'sistema'` (a IA/servidor, ex.: transferir_para_humano). */
export const ATOR_SISTEMA = 'sistema';

export interface DestinoTransferencia {
  setorId?: string;
  usuarioId?: string;
}

/** Motivo gravado nas mensagens automáticas canceladas por cada ação. */
const MOTIVO_CANCELAMENTO = {
  assumir: 'Atendimento assumido',
  pausar: 'IA pausada',
  transferir: 'Atendimento transferido',
  encerrar: 'Atendimento encerrado',
  iaGlobal: 'IA desligada no interruptor geral',
} as const;

interface Mudanca {
  estado: EstadoConversa;
  responsavelId?: string | null;
  setorId?: string | null;
  /** Texto do evento sem o sujeito (ex.: "assumiu o atendimento"). */
  evento: string;
  nota?: string;
}

interface Ator {
  id: string;
  sistema: boolean;
  /** Sujeito do texto do evento: nome do usuário ou "A IA". */
  nome: string;
  /** Ator da auditoria. */
  auditoria: string;
}

/**
 * Controle humano sobre a IA (spec §8). Cada ação trava a linha da conversa (`SELECT ... FOR UPDATE`),
 * muda estado/responsável, incrementa `versaoControle`, grava um evento na conversa, audita com o
 * ator real e publica `conversation.updated` + `message.created`. Fora de `IA_ATIVA`, cancela as
 * automáticas pendentes. Só `devolver` leva de volta a `IA_ATIVA`.
 * Usado pelo papel web (API do painel) e pelo worker (agente).
 */
@Injectable()
export class ControleService {
  private readonly logger = new Logger(ControleService.name);

  /**
   * `channel`, `settings` e `config` são opcionais (compatível com `new ControleService(prisma,
   * audit, eventos, saida)`): sem eles, só não manda a presença `paused` ao sair de `IA_ATIVA`.
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly eventos: EventosService,
    private readonly saida: OutboundService,
    @Optional() @Inject(CHANNEL_PORT) private readonly channel?: ChannelPort,
    @Optional() private readonly settings?: SettingsService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async assumir(conversationId: string, atorId: string): Promise<void> {
    const ator = await this.ator(atorId);
    await this.aplicar(conversationId, ator, 'assumir', () => ({
      estado: 'HUMANO',
      responsavelId: ator.sistema ? null : ator.id,
      evento: 'assumiu o atendimento',
    }));
  }

  async pausar(conversationId: string, atorId: string): Promise<void> {
    const ator = await this.ator(atorId);
    await this.aplicar(conversationId, ator, 'pausar', () => ({
      estado: 'IA_PAUSADA',
      responsavelId: null,
      evento: 'pausou a IA',
    }));
  }

  /** Só uma pessoa devolve à IA (spec §8.1: "A IA nunca volta sozinha"). */
  async devolver(conversationId: string, atorId: string): Promise<void> {
    if (atorId === ATOR_SISTEMA) {
      throw new ForbiddenException('Só uma pessoa pode devolver o atendimento à IA');
    }
    const ator = await this.ator(atorId);
    await this.aplicar(conversationId, ator, 'devolver', () => ({
      estado: 'IA_ATIVA',
      responsavelId: null,
      evento: 'devolveu o atendimento à IA',
    }));
  }

  async transferir(conversationId: string, atorId: string, destino: DestinoTransferencia, nota?: string): Promise<void> {
    if (!destino?.setorId && !destino?.usuarioId) {
      throw new BadRequestException('Informe o setor ou a pessoa de destino');
    }
    const ator = await this.ator(atorId);
    const setor = destino.setorId
      ? await this.prisma.sector.findUnique({ where: { id: destino.setorId }, select: { id: true, nome: true } })
      : null;
    if (destino.setorId && !setor) throw new NotFoundException('Setor não encontrado');
    const usuario = destino.usuarioId
      ? await this.prisma.user.findFirst({ where: { id: destino.usuarioId, ativo: true }, select: { id: true, nome: true } })
      : null;
    if (destino.usuarioId && !usuario) throw new NotFoundException('Pessoa de destino não encontrada');

    await this.aplicar(conversationId, ator, 'transferir', () =>
      usuario
        ? {
            estado: 'HUMANO',
            responsavelId: usuario.id,
            ...(setor ? { setorId: setor.id } : {}),
            evento: `transferiu o atendimento para ${usuario.nome}`,
            nota,
          }
        : {
            estado: 'AGUARDANDO_ESPECIALISTA',
            responsavelId: null,
            setorId: setor!.id,
            evento: `transferiu o atendimento para ${setor!.nome}`,
            nota,
          },
    );
  }

  async encerrar(conversationId: string, atorId: string, motivo?: string): Promise<void> {
    const ator = await this.ator(atorId);
    const m = motivo?.trim();
    await this.aplicar(conversationId, ator, 'encerrar', () => ({
      estado: 'ENCERRADA',
      evento: m ? `encerrou o atendimento: ${m}` : 'encerrou o atendimento',
    }));
  }

  /**
   * Interruptor geral (spec §8.2). Grava o setting e incrementa `versaoControle` de todas as
   * conversas abertas na mesma transação (o UPDATE trava as linhas, como o FOR UPDATE das outras
   * ações); ao desligar, cancela as automáticas pendentes de todas as conversas.
   * Mesmo valor que o atual: nada muda (sem versão +1, auditoria nem evento), para não cancelar
   * respostas da IA em andamento à toa.
   */
  async definirIaGlobal(ativa: boolean, atorId: string): Promise<void> {
    const ator = await this.ator(atorId);
    const mudou = await this.prisma.$transaction(async (tx) => {
      // trava a linha do setting (se existir) para serializar dois cliques simultâneos
      await tx.$queryRaw`SELECT chave FROM system_settings WHERE chave = 'iaGlobalAtiva' FOR UPDATE`;
      const s = await tx.systemSetting.findUnique({ where: { chave: 'iaGlobalAtiva' } });
      const atual = typeof s?.valor === 'boolean' ? s.valor : true; // mesmo padrão do SettingsService
      if (atual === ativa) return false;
      await tx.systemSetting.upsert({
        where: { chave: 'iaGlobalAtiva' },
        create: { chave: 'iaGlobalAtiva', valor: ativa, atualizadoPor: ator.sistema ? null : ator.id },
        update: { valor: ativa, atualizadoPor: ator.sistema ? null : ator.id },
      });
      await tx.conversation.updateMany({
        where: { estado: { not: 'ENCERRADA' } },
        data: { versaoControle: { increment: 1 } },
      });
      return true;
    });
    if (!mudou) return;
    await this.registrarAuditoria({
      ator: ator.auditoria,
      acao: ativa ? 'ia_global.ligar' : 'ia_global.desligar',
      entidade: 'system_setting',
      entidadeId: 'iaGlobalAtiva',
    });
    await this.publicar('settings.updated', { chave: 'iaGlobalAtiva' });
    if (ativa) return;

    const comPendentes = await this.prisma.message.findMany({
      where: { status: 'pendente', OR: [{ autor: 'ia' }, { autor: 'sistema', versaoControle: { not: null } }] },
      distinct: ['conversationId'],
      select: { conversationId: true },
    });
    for (const { conversationId } of comPendentes) {
      await this.cancelarPendentes(conversationId, MOTIVO_CANCELAMENTO.iaGlobal);
    }
  }

  private async aplicar(
    conversationId: string,
    ator: Ator,
    acao: 'assumir' | 'pausar' | 'devolver' | 'transferir' | 'encerrar',
    calcular: (atual: Conversation) => Mudanca,
  ): Promise<void> {
    type MensagemCriada = Message & { autorUsuario: { id: string; nome: string } | null };
    const resultado = await this.prisma.$transaction(async (tx) => {
      const travada = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM conversations WHERE id = ${conversationId} FOR UPDATE`;
      if (travada.length === 0) throw new NotFoundException('Conversa não encontrada');
      const atual = await tx.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        include: { numero: { select: { instanciaEvolution: true } }, contact: { select: { e164: true } } },
      });
      const mudanca = calcular(atual);
      const nota = mudanca.nota?.trim();
      const criarNota = (): Promise<MensagemCriada> =>
        tx.message.create({
          data: {
            conversationId,
            numeroId: atual.numeroId,
            autor: ator.sistema ? 'sistema' : 'atendente',
            autorUsuarioId: ator.sistema ? null : ator.id,
            tipo: 'nota_interna',
            texto: nota!,
          },
          include: { autorUsuario: { select: { id: true, nome: true } } },
        });

      // sem mudança real (ex.: devolver com a conversa já em IA_ATIVA): não incrementa a versão,
      // senão as respostas da IA em andamento seriam canceladas à toa. Só guarda a nota, se houver.
      const semMudanca =
        mudanca.estado === atual.estado &&
        (mudanca.responsavelId === undefined || mudanca.responsavelId === atual.responsavelId) &&
        (mudanca.setorId === undefined || mudanca.setorId === atual.setorId);
      if (semMudanca) return { mudou: false as const, criadas: nota ? [await criarNota()] : [] };

      const data: Prisma.ConversationUncheckedUpdateInput = {
        estado: mudanca.estado,
        versaoControle: { increment: 1 },
      };
      if (mudanca.responsavelId !== undefined) data.responsavelId = mudanca.responsavelId;
      if (mudanca.setorId !== undefined) data.setorId = mudanca.setorId;
      const conversa = await tx.conversation.update({ where: { id: conversationId }, data, include: INCLUDE_CONVERSA_ITEM });

      const criadas: MensagemCriada[] = [];
      criadas.push(
        await tx.message.create({
          data: {
            conversationId,
            numeroId: atual.numeroId,
            autor: 'sistema',
            tipo: 'evento',
            texto: `${ator.nome} ${mudanca.evento}`,
          },
          include: { autorUsuario: { select: { id: true, nome: true } } },
        }),
      );
      if (nota) criadas.push(await criarNota());
      return {
        mudou: true as const,
        conversa,
        criadas,
        saiuDaIa: atual.estado === 'IA_ATIVA' && mudanca.estado !== 'IA_ATIVA',
        instancia: atual.numero.instanciaEvolution,
        para: atual.contact.e164,
      };
    });

    if (!resultado.mudou) {
      for (const m of resultado.criadas) await this.publicar('message.created', { conversationId, mensagem: paraMensagemDTO(m) });
      return;
    }
    const { conversa, criadas } = resultado;

    // a IA saiu do controle: apaga o "IA escrevendo…" do painel e o "digitando…" do cliente na hora
    if (resultado.saiuDaIa) {
      await this.publicar('agent.typing', { conversationId, ativo: false });
      this.pararDigitando(resultado.instancia, resultado.para);
    }

    await this.registrarAuditoria({
      ator: ator.auditoria,
      acao: `conversa.${acao}`,
      entidade: 'conversation',
      entidadeId: conversationId,
    });
    await this.publicar('conversation.updated', { conversa: paraConversaItemDTO(conversa) });
    for (const m of criadas) await this.publicar('message.created', { conversationId, mensagem: paraMensagemDTO(m) });

    // otimização (spec §8.3 item 5): a garantia é a revalidação do processador, que já vê a versão nova
    if (conversa.estado !== 'IA_ATIVA' && acao !== 'devolver') {
      await this.cancelarPendentes(conversationId, MOTIVO_CANCELAMENTO[acao]);
    }
  }

  private async ator(atorId: string): Promise<Ator> {
    if (atorId === ATOR_SISTEMA) return { id: ATOR_SISTEMA, sistema: true, nome: 'A IA', auditoria: ATOR_SISTEMA };
    const u = await this.prisma.user.findUnique({ where: { id: atorId }, select: { id: true, nome: true } });
    if (!u) throw new NotFoundException('Usuário não encontrado');
    return { id: u.id, sistema: false, nome: u.nome, auditoria: `usuario_painel:${u.id}` };
  }

  /**
   * Presença `paused` sem aguardar e ignorando erro (é indicador de digitação, não mensagem).
   * Respeita a trava da demonstração: destino fora da lista não recebe nada pelo canal.
   */
  private pararDigitando(instancia: string, para: string): void {
    const channel = this.channel;
    if (!channel) return;
    void (async () => {
      const demo = this.config?.get<unknown>('DEMO_MODE');
      if (demo === true || demo === 'true' || demo === '1') {
        const permitidos = (await this.settings?.numerosPermitidos()) ?? [];
        if (!permitidos.some((p) => mesmoNumero(p, para))) return;
      }
      await channel.enviarPresenca(instancia, para, 'paused', 0);
    })().catch(() => undefined);
  }

  private async cancelarPendentes(conversationId: string, motivo: string): Promise<void> {
    try {
      await this.saida.cancelarAutomaticasPendentes(conversationId, motivo);
    } catch (e) {
      this.logger.warn(`não cancelou as automáticas de ${conversationId}: ${(e as Error).message}`);
    }
  }

  private async registrarAuditoria(e: Parameters<AuditService['registrar']>[0]): Promise<void> {
    try {
      await this.audit.registrar(e);
    } catch (err) {
      this.logger.error(`auditoria falhou (${e.acao} ${e.entidadeId}): ${(err as Error).message}`);
    }
  }

  private async publicar<T extends EventoTempoReal['tipo']>(
    tipo: T,
    payload: Extract<EventoTempoReal, { tipo: T }>['payload'],
  ): Promise<void> {
    try {
      // a assinatura tipada fica no wrapper; o repasse genérico não é inferível pelo TS
      await (this.eventos.publicar as (t: string, p: unknown) => Promise<void>)(tipo, payload);
    } catch (e) {
      this.logger.warn(`falha ao publicar ${tipo}: ${(e as Error).message}`);
    }
  }
}
