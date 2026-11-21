import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { filtrarBolha, lerTermosProibidos } from '@sales-hub/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboundService } from '../../outbound/outbound.service';
import { formatarReais } from '../prompt/estavel';
import type { ContextoTurno, ResultadoFerramenta } from './contexto';

const MAX_BOLHAS_TURNO = 4;

const MOTIVO_DESCONTO = 'Bolha bloqueada: não ofereça desconto nem percentual. Reescreva sem isso.';

/** Mensagem de correção para o modelo quando a bolha usa um termo proibido pela empresa. */
export function motivoTermoProibido(termo: string | undefined): string {
  return termo
    ? `Bolha bloqueada: não use "${termo}" (termo proibido pela empresa). Reescreva a mensagem sem ele.`
    : 'Bolha bloqueada: a mensagem usa um termo proibido pela empresa. Reescreva sem ele.';
}

function motivoValor(permitidos: number[]): string {
  const lista = [...new Set(permitidos)].sort((a, b) => a - b).map(formatarReais).join(', ');
  return `Bolha bloqueada: valor em R$ fora do catálogo aprovado. ${lista ? `Valores permitidos: ${lista}` : 'Não há valor público aprovado'}; para o que é sob cotação, chame solicitar_cotacao.`;
}

/** `responder` (spec §9.3/§9.7): filtro de saída em cada bolha, até 4 por turno, versão do turno. */
@Injectable()
export class ResponderTool {
  constructor(
    private readonly prisma: PrismaService,
    private readonly saida: OutboundService,
    private readonly config: ConfigService,
  ) {}

  async responder(ctx: ContextoTurno, i: { mensagens: string[] }): Promise<ResultadoFerramenta> {
    if (ctx.bolhasIds.length + i.mensagens.length > MAX_BOLHAS_TURNO) {
      return { ok: false, erro: `Limite de ${MAX_BOLHAS_TURNO} bolhas por turno: já foram ${ctx.bolhasIds.length}.` };
    }
    const permitidos = (
      await this.prisma.priceRule.findMany({ where: { aprovado: true, demonstracao: false, valorCentavos: { not: null } }, select: { valorCentavos: true } })
    ).map((p) => p.valorCentavos!);
    const termos = lerTermosProibidos(this.config.get<string>('AGENT_TERMOS_PROIBIDOS'));
    for (const [n, m] of i.mensagens.entries()) {
      const f = filtrarBolha(m, permitidos, termos);
      if (!f.ok) {
        const motivo =
          f.motivo === 'valor_nao_aprovado'
            ? motivoValor(permitidos)
            : f.motivo === 'termo_proibido'
              ? motivoTermoProibido(f.termo)
              : MOTIVO_DESCONTO;
        return { ok: false, bloqueio: true, erro: `${motivo} (bolha ${n + 1})` };
      }
    }
    const ids = await this.saida.criarBolhasIa({
      conversationId: ctx.conversationId,
      textos: i.mensagens,
      agentTurnId: ctx.agentTurnId,
      versao: ctx.versao,
    });
    // vazio = a conversa saiu de IA_ATIVA ou mudou de versão (garantia de parada)
    if (ids.length === 0) return { ok: false, abortado: true, erro: 'Resposta descartada: atendimento assumido' };
    ctx.bolhasIds.push(...ids);
    return { ok: true, resultado: { enviadas: ids.length } };
  }
}
