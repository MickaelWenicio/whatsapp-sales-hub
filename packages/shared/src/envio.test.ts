import { describe, expect, it } from 'vitest';
import { decidirEnvio, type EstadoEnvio } from './envio';

const base: EstadoEnvio = {
  automatica: true,
  estadoConversa: 'IA_ATIVA',
  versaoMensagem: 2,
  versaoAtual: 2,
  iaGlobalAtiva: true,
  interrupcaoRegistrada: false,
  confirmadoRestrito: false,
  demoMode: false,
  destinoPermitido: true,
  numeroConectado: true,
};

describe('decidirEnvio', () => {
  it('casos', () => {
    expect(decidirEnvio(base)).toEqual({ acao: 'enviar' });
    expect(decidirEnvio({ ...base, estadoConversa: 'HUMANO' })).toEqual({ acao: 'cancelar', motivo: 'estado_nao_ia_ativa' });
    expect(decidirEnvio({ ...base, versaoAtual: 3, versaoMensagem: 2 })).toEqual({ acao: 'cancelar', motivo: 'versao_mudou' });
    expect(decidirEnvio({ ...base, iaGlobalAtiva: false })).toEqual({ acao: 'cancelar', motivo: 'ia_global_desligada' });
    expect(decidirEnvio({ ...base, interrupcaoRegistrada: true })).toEqual({ acao: 'cancelar', motivo: 'interrupcao_registrada' });
    expect(decidirEnvio({ ...base, automatica: false, estadoConversa: 'HUMANO' })).toEqual({ acao: 'enviar' });
    expect(decidirEnvio({ ...base, automatica: false, interrupcaoRegistrada: true })).toEqual({
      acao: 'falhar',
      motivo: 'restrito_sem_confirmacao',
    });
    expect(decidirEnvio({ ...base, automatica: false, interrupcaoRegistrada: true, confirmadoRestrito: true })).toEqual({
      acao: 'enviar',
    });
    expect(decidirEnvio({ ...base, demoMode: true, destinoPermitido: false, numeroConectado: false })).toEqual({ acao: 'simular' });
    expect(decidirEnvio({ ...base, numeroConectado: false })).toEqual({ acao: 'falhar', motivo: 'numero_desconectado' });
  });
});
