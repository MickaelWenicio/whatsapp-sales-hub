import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { NumeroDTO } from '@sales-hub/shared';
import { ehNumeroFicticio, normalizarTelefoneBr } from '@sales-hub/shared';
import { z } from 'zod';
import { paraNumeroDTO } from '../../common/mapeadores';
import { PrismaService } from '../../prisma/prisma.service';
import { CHANNEL_PORT, type ChannelPort } from '../channel/channel.port';
import { EventosService } from '../realtime/eventos.service';
import { AuditService } from '../security/audit.service';
import { validar } from './painel.service';

const E164_PLACEHOLDER = '+5500900000000';
const rotuloSchema = z.string().trim().min(2, 'informe um nome').max(60);

function slug(texto: string): string {
  const base = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 16);
  return `${base || 'numero'}-${randomBytes(2).toString('hex')}`;
}

/** O sistema tem exatamente UM número de operação (o que o agente atende). */
@Injectable()
export class NumeroOperacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly eventos: EventosService,
    @Inject(CHANNEL_PORT) private readonly channel: ChannelPort,
  ) {}

  async criar(body: unknown, atorId: string): Promise<NumeroDTO> {
    const dto = validar(z.object({ rotulo: rotuloSchema, e164: z.string() }), body);
    const e164 = normalizarTelefoneBr(dto.e164);
    if (!e164) throw new BadRequestException('Informe um telefone brasileiro válido com DDD.');
    const existentes = await this.prisma.whatsAppNumber.findMany({ where: { ficticio: false } });
    if (existentes.some((n) => !ehNumeroFicticio(n.e164)))
      throw new ConflictException('Já existe um número da operação. Remova ou troque o atual.');
    // linha com e164 de placeholder = não configurada: reaproveita (mantém o histórico da demo)
    const placeholder = existentes[0] ?? null;
    const instancia = placeholder?.instanciaEvolution ?? `sales-hub-${slug(dto.rotulo)}`;
    try {
      await this.channel.criarInstancia(instancia);
      await this.channel.configurarWebhook(instancia);
    } catch {
      throw new ServiceUnavailableException(
        'Não foi possível criar a conexão no WhatsApp. Confira se a Evolution está no ar.',
      );
    }
    const numero = placeholder
      ? await this.prisma.whatsAppNumber.update({
          where: { id: placeholder.id },
          data: { rotulo: dto.rotulo, e164, estado: 'desconectado', ultimaFalha: null },
        })
      : await this.prisma.whatsAppNumber.create({
          data: { rotulo: dto.rotulo, e164, instanciaEvolution: instancia, estado: 'desconectado' },
        });
    await this.audit.registrar({
      ator: `usuario_painel:${atorId}`,
      acao: 'numero_operacao.criar',
      entidade: 'whatsapp_number',
      entidadeId: numero.id,
    });
    const out = paraNumeroDTO(numero);
    await this.eventos.publicar('number.status', { numero: out });
    return out;
  }

  async renomear(id: string, body: unknown, atorId: string): Promise<NumeroDTO> {
    const dto = validar(z.object({ rotulo: rotuloSchema }), body);
    const atual = await this.prisma.whatsAppNumber.findUnique({ where: { id } });
    if (!atual || atual.ficticio) throw new NotFoundException('Número não encontrado');
    const numero = await this.prisma.whatsAppNumber.update({
      where: { id },
      data: { rotulo: dto.rotulo },
    });
    await this.audit.registrar({
      ator: `usuario_painel:${atorId}`,
      acao: 'numero_operacao.renomear',
      entidade: 'whatsapp_number',
      entidadeId: id,
    });
    const out = paraNumeroDTO(numero);
    await this.eventos.publicar('number.status', { numero: out });
    return out;
  }

  async remover(id: string, atorId: string): Promise<void> {
    const numero = await this.prisma.whatsAppNumber.findUnique({ where: { id } });
    if (!numero || numero.ficticio) throw new NotFoundException('Número não encontrado');
    const [conversas, mensagens, eventos] = await Promise.all([
      this.prisma.conversation.count({ where: { numeroId: id } }),
      this.prisma.message.count({ where: { numeroId: id } }),
      this.prisma.inboundEvent.count({ where: { numeroId: id } }),
    ]);
    const temHistorico = conversas + mensagens + eventos > 0;
    let acao: string;
    try {
      if (temHistorico) await this.channel.desconectar(numero.instanciaEvolution).catch(() => undefined);
      else await this.channel.removerInstancia(numero.instanciaEvolution);
    } catch {
      throw new ServiceUnavailableException(
        'Não foi possível remover a conexão no WhatsApp. Tente de novo.',
      );
    }
    if (temHistorico) {
      // histórico (Restrict) preserva a linha: volta ao placeholder, mantém a instância para reuso
      await this.prisma.whatsAppNumber.update({
        where: { id },
        data: { e164: E164_PLACEHOLDER, estado: 'desconectado', ultimaFalha: null },
      });
      acao = 'numero_operacao.resetar';
    } else {
      await this.prisma.whatsAppNumber.delete({ where: { id } });
      acao = 'numero_operacao.remover';
    }
    await this.audit.registrar({
      ator: `usuario_painel:${atorId}`,
      acao,
      entidade: 'whatsapp_number',
      entidadeId: id,
    });
    await this.eventos.publicar('number.status', {
      numero: { ...paraNumeroDTO(numero), estado: 'desconectado' },
    });
  }
}
