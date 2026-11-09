import type { DecisaoEnvio } from '@sales-hub/shared';

type MotivoDecisao = Extract<DecisaoEnvio, { motivo: string }>['motivo'];

/** `Message.motivoFalha` legível para cada motivo de `decidirEnvio` (aparece no painel). */
export const TEXTO_MOTIVO_ENVIO: Record<MotivoDecisao, string> = {
  estado_nao_ia_ativa: 'A IA não estava mais no controle do atendimento',
  versao_mudou: 'O controle do atendimento mudou antes do envio',
  ia_global_desligada: 'IA desligada no interruptor geral',
  interrupcao_registrada: 'O contato pediu para não receber mensagens',
  restrito_sem_confirmacao: 'O contato pediu para não receber mensagens. Confirme antes de enviar',
  numero_desconectado: 'WhatsApp desconectado',
};

/** Motivo gravado quando o envio pelo canal lança erro. */
export function textoFalhaCanal(erro: unknown): string {
  const msg = erro instanceof Error ? erro.message : String(erro);
  return `Falha no envio pelo WhatsApp: ${msg}`.slice(0, 500);
}
