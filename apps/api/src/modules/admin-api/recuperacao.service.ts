import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { filtrarBolha } from '@sales-hub/shared';
import { z } from 'zod';
import { getAgentConfig, getEmpresaConfig } from '../../config/claude';
import { PrismaService } from '../../prisma/prisma.service';
import { validar } from './painel.service';

const bodySchema = z.object({
  modelos: z.array(z.string().trim().min(10).max(600)).min(1).max(5),
  quantidade: z.number().int().min(1).max(4),
});

export const VariacoesSchema = z.object({
  variacoes: z.array(z.object({ modeloIndex: z.number().int(), texto: z.string() })),
});

export interface VariacaoDTO {
  modeloIndex: number;
  texto: string;
}

const TIMEOUT_MS = 40_000;

/** Instruções do gerador de variações, com o nome e a descrição da empresa configurados. */
export function promptRecuperacao(empresaNome: string, empresaDescricao: string, termosProibidos: readonly string[] = []): string {
  return (
    `Você escreve mensagens curtas de WhatsApp em português do Brasil para a ${empresaNome} (${empresaDescricao.replace(/\.$/, '')}), ` +
    'para retomar contato com leads que esfriaram. Para cada modelo recebido, crie variações que mantêm o mesmo sentido ' +
    'e mantêm os marcadores {nome} e {interesse} exatamente como escritos (com chaves, sem alterar). ' +
    'Varie a abertura, as palavras e a ordem das frases para que nenhuma mensagem seja igual a outra. ' +
    'Não acrescente ofertas, preços, descontos ou promessas novas. ' +
    (termosProibidos.length ? `Nunca use estas palavras ou expressões: ${termosProibidos.map((t) => `"${t}"`).join(', ')}. ` : '') +
    'Cada variação deve ter no máximo 600 caracteres. modeloIndex é o número do modelo de origem.'
  );
}

/** Gera variações de mensagens de recuperação com Claude (saída estruturada). */
@Injectable()
export class RecuperacaoService {
  private readonly logger = new Logger(RecuperacaoService.name);
  protected client?: Pick<Anthropic, 'messages'>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma?: PrismaService,
  ) {}

  async gerarVariacoes(body: unknown): Promise<{ variacoes: VariacaoDTO[] }> {
    const dto = validar(bodySchema, body);
    if (!this.config.get<string>('ANTHROPIC_API_KEY') && !process.env.ANTHROPIC_API_KEY) {
      throw new ServiceUnavailableException(
        'A geração de variações precisa da chave da IA configurada.',
      );
    }
    const { model } = getAgentConfig(this.config);
    const empresa = getEmpresaConfig(this.config);
    this.client ??= new Anthropic({
      apiKey: this.config.get<string>('ANTHROPIC_API_KEY') || undefined,
      timeout: TIMEOUT_MS,
      maxRetries: 1,
    });
    const lista = dto.modelos.map((m, i) => `Modelo ${i}: ${m}`).join('\n');
    let saida: z.infer<typeof VariacoesSchema> | null;
    try {
      const resp = await this.client.messages.parse(
        {
          model,
          max_tokens: 4000,
          output_config: { effort: 'low', format: zodOutputFormat(VariacoesSchema) },
          system: promptRecuperacao(empresa.nome, empresa.descricao, empresa.termosProibidos),
          messages: [
            {
              role: 'user',
              content: `Crie ${dto.quantidade} variação(ões) para cada modelo abaixo.\n\n${lista}`,
            },
          ],
        },
        { timeout: TIMEOUT_MS },
      );
      saida = resp.parsed_output;
    } catch (e) {
      this.logger.warn(`falha ao gerar variações: ${(e as Error).message}`);
      throw new BadGatewayException(
        'Não foi possível gerar as variações agora. Tente de novo em instantes.',
      );
    }
    if (!saida) {
      throw new BadGatewayException('A IA não devolveu variações válidas. Tente de novo.');
    }
    // valores públicos vêm do catálogo aprovado (sem preços de demonstração)
    const permitidos = this.prisma
      ? (
          await this.prisma.priceRule.findMany({
            where: { aprovado: true, demonstracao: false, valorCentavos: { not: null } },
            select: { valorCentavos: true },
          })
        ).map((p) => p.valorCentavos!)
      : [6990];
    const variacoes = saida.variacoes.filter(
      (v) =>
        Number.isInteger(v.modeloIndex) &&
        v.modeloIndex >= 0 &&
        v.modeloIndex < dto.modelos.length &&
        v.texto.trim().length > 0 &&
        v.texto.length <= 600 &&
        filtrarBolha(v.texto, permitidos, empresa.termosProibidos).ok,
    );
    return {
      variacoes: variacoes.map((v) => ({ modeloIndex: v.modeloIndex, texto: v.texto.trim() })),
    };
  }
}
