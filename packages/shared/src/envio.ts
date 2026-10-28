import type { EstadoConversa } from './enums';

export interface EstadoEnvio {
  automatica: boolean; // autor ia (ou acompanhamento/campanha em fases futuras)
  estadoConversa: EstadoConversa;
  versaoMensagem: number | null; // Message.versaoControle
  versaoAtual: number; // Conversation.versaoControle
  iaGlobalAtiva: boolean;
  interrupcaoRegistrada: boolean;
  confirmadoRestrito: boolean;
  demoMode: boolean;
  destinoPermitido: boolean;
  numeroConectado: boolean;
}
export type MotivoCancelamento =
  | 'estado_nao_ia_ativa'
  | 'versao_mudou'
  | 'ia_global_desligada'
  | 'interrupcao_registrada';
export type DecisaoEnvio =
  | { acao: 'enviar' }
  | { acao: 'simular' }
  | { acao: 'cancelar'; motivo: MotivoCancelamento }
  | { acao: 'falhar'; motivo: 'restrito_sem_confirmacao' | 'numero_desconectado' };

export function decidirEnvio(e: EstadoEnvio): DecisaoEnvio {
  if (e.automatica) {
    if (e.estadoConversa !== 'IA_ATIVA') return { acao: 'cancelar', motivo: 'estado_nao_ia_ativa' };
    if (e.versaoMensagem !== e.versaoAtual) return { acao: 'cancelar', motivo: 'versao_mudou' };
    if (!e.iaGlobalAtiva) return { acao: 'cancelar', motivo: 'ia_global_desligada' };
    if (e.interrupcaoRegistrada) return { acao: 'cancelar', motivo: 'interrupcao_registrada' };
  } else if (e.interrupcaoRegistrada && !e.confirmadoRestrito) {
    return { acao: 'falhar', motivo: 'restrito_sem_confirmacao' };
  }
  if (e.demoMode && !e.destinoPermitido) return { acao: 'simular' };
  if (!e.numeroConectado) return { acao: 'falhar', motivo: 'numero_desconectado' };
  return { acao: 'enviar' };
}
