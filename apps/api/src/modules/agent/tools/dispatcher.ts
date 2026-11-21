import { HttpException, Injectable } from '@nestjs/common';
import { ehFerramenta, FERRAMENTAS, type NomeFerramenta } from './definicoes';
import { CrmTools } from './crm.tools';
import { FunilTools } from './funil.tools';
import { ResponderTool } from './responder.tool';
import { SegurancaTools } from './seguranca.tools';
import type { ContextoTurno, ResultadoFerramenta } from './contexto';

/**
 * Valida a entrada com zod (falha = erro devolvido ao modelo como `is_error`) e executa a
 * ferramenta. Exceções de regra (FunilService etc.) também viram erro para o modelo corrigir.
 */
@Injectable()
export class Dispatcher {
  constructor(
    private readonly responder: ResponderTool,
    private readonly crm: CrmTools,
    private readonly funil: FunilTools,
    private readonly seguranca: SegurancaTools,
  ) {}

  async executar(ctx: ContextoTurno, nome: string, input: unknown): Promise<ResultadoFerramenta> {
    if (!ehFerramenta(nome)) return { ok: false, erro: `Ferramenta desconhecida: ${nome}` };
    const v = FERRAMENTAS[nome].schema.safeParse(input);
    if (!v.success) {
      const msg = v.error.issues.map((i) => `${i.path.join('.') || 'entrada'}: ${i.message}`).join('; ');
      return { ok: false, erro: `Entrada inválida (${msg}). Entrada recebida: ${JSON.stringify(input)}` };
    }
    try {
      return await this.despachar(ctx, nome, v.data as never);
    } catch (e) {
      const erro = e instanceof HttpException ? String((e.getResponse() as { message?: unknown }).message ?? e.message) : (e as Error).message;
      return { ok: false, erro };
    }
  }

  private despachar(ctx: ContextoTurno, nome: NomeFerramenta, i: never): Promise<ResultadoFerramenta> {
    switch (nome) {
      case 'responder':
        return this.responder.responder(ctx, i);
      case 'atualizar_contato':
        return this.crm.atualizarContato(ctx, i);
      case 'registrar_item':
        return this.crm.registrarItem(ctx, i);
      case 'registrar_interesse':
        return this.crm.registrarInteresse(ctx, i);
      case 'registrar_objecao':
        return this.crm.registrarObjecao(ctx, i);
      case 'mover_etapa':
        return this.funil.moverEtapa(ctx, i);
      case 'solicitar_cotacao':
        return this.funil.solicitarCotacao(ctx, i);
      case 'sinalizar_intencao':
        return this.funil.sinalizarIntencao(ctx, i);
      case 'transferir_para_humano':
        return this.seguranca.transferirParaHumano(ctx, i);
      case 'sinalizar_emergencia':
        return this.seguranca.sinalizarEmergencia(ctx, i);
      case 'registrar_interrupcao':
        return this.seguranca.registrarInterrupcao(ctx);
    }
  }
}
