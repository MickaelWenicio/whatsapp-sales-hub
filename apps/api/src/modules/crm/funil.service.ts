import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { exigeEvidencia, exigeMotivo, podeMover, type Etapa, type OportunidadeCardDTO } from '@sales-hub/shared';
import { INCLUDE_OPORTUNIDADE_CARD, paraOportunidadeCardDTO } from '../../common/mapeadores';
import { PrismaService } from '../../prisma/prisma.service';
import { EventosService } from '../realtime/eventos.service';

export interface MoverInput {
  opportunityId: string;
  para: Etapa;
  ator: 'ia' | 'humano' | 'sistema';
  atorUsuarioId?: string;
  justificativa?: string;
  mensagemOrigemId?: string;
  motivoPerda?: string;
  evidencia?: { tipo: 'contrato_assinado' | 'pagamento_confirmado' | 'confirmacao_sistema'; observacao: string };
}

@Injectable()
export class FunilService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: EventosService,
  ) {}

  async mover(i: MoverInput): Promise<OportunidadeCardDTO> {
    const card = await this.prisma.$transaction(async (tx) => {
      const op = await tx.opportunity.findUnique({ where: { id: i.opportunityId }, include: { contact: true } });
      if (!op) throw new NotFoundException('Oportunidade não encontrada.');

      if (i.para === 'venda_confirmada' && i.ator === 'ia') {
        throw new BadRequestException('A IA não pode confirmar vendas. Uma pessoa precisa confirmar com evidência.');
      }
      const pode = podeMover(op.etapa, i.para, i.ator);
      if (!pode.ok) throw new BadRequestException(pode.motivo);

      const motivoPerda = i.motivoPerda?.trim();
      if (exigeMotivo(i.para) && !motivoPerda) throw new BadRequestException('Informe o motivo da perda.');
      const obs = i.evidencia?.observacao?.trim();
      if (exigeEvidencia(i.para) && (!i.evidencia || !obs)) {
        throw new UnprocessableEntityException(
          'Para confirmar a venda, informe a evidência (contrato assinado, pagamento confirmado ou confirmação do sistema) e uma observação.',
        );
      }

      const fecha = i.para === 'venda_confirmada' || i.para === 'perdido';
      const agora = new Date();
      // trava otimista: só move se a etapa ainda é a que foi validada
      const r = await tx.opportunity.updateMany({
        where: { id: op.id, etapa: op.etapa },
        data: {
          etapa: i.para,
          etapaDesde: agora,
          fechadaEm: fecha ? agora : null,
          ...(i.para === 'perdido' ? { motivoPerda } : {}),
        },
      });
      if (r.count === 0) throw new ConflictException('A oportunidade foi alterada por outra pessoa. Atualize e tente de novo.');

      await tx.opportunityEvent.create({
        data: {
          opportunityId: op.id,
          de: op.etapa,
          para: i.para,
          ator: i.ator,
          atorUsuarioId: i.atorUsuarioId ?? null,
          justificativa: i.justificativa ?? null,
          mensagemOrigemId: i.mensagemOrigemId ?? null,
          evidencia: i.evidencia ? ({ ...i.evidencia, observacao: obs } as Prisma.InputJsonValue) : undefined,
        },
      });

      if (i.para === 'venda_confirmada') {
        await tx.task.create({
          data: {
            tipo: 'pos_venda',
            titulo: `Pós-venda: ${op.contact.nome ?? op.contact.e164}`,
            opportunityId: op.id,
            responsavelId: op.responsavelId,
          },
        });
        await tx.contact.update({ where: { id: op.contactId }, data: { statusCliente: 'cliente_ativo' } });
      }

      const atual = await tx.opportunity.findUniqueOrThrow({ where: { id: op.id }, include: INCLUDE_OPORTUNIDADE_CARD });
      return paraOportunidadeCardDTO(atual);
    });

    // publica só depois do commit; falha de publicação não desfaz a mudança
    await this.eventos.publicar('opportunity.updated', { oportunidade: card }).catch(() => undefined);
    return card;
  }
}
