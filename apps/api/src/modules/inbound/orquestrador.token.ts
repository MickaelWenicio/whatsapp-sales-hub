/**
 * Contrato do orquestrador do agente (implementado na Task 10). Vive aqui, sem imports do
 * resto do módulo, para a Task 10 poder implementá-lo sem dependência circular.
 */
export const ORQUESTRADOR = Symbol('ORQUESTRADOR');

export type ResultadoTurno = 'respondido' | 'escalado' | 'ignorado' | 'falhou';

export interface SinaisTurno {
  emergencia: boolean;
  interrupcao: boolean;
}

export interface Orquestrador {
  processar(conversationId: string, sinais: SinaisTurno): Promise<ResultadoTurno>;
}

/** Stub até a Task 10: não faz nada. */
export class OrquestradorStub implements Orquestrador {
  async processar(): Promise<ResultadoTurno> {
    return 'ignorado';
  }
}
