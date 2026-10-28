/**
 * Decisão PURA do "debounce por contato": dado o estado das mensagens de um
 * atendimento, decide se o turno do agente deve rodar agora, aguardar (o lead ainda
 * pode estar digitando) ou não fazer nada. Sem I/O — testável isoladamente.
 *
 * Cada mensagem recebida agenda um job de turno com atraso = `debounceMs`. Quando o
 * job dispara, esta função garante que só o job da ÚLTIMA mensagem do burst rode:
 * os jobs de mensagens anteriores enxergam uma entrada mais nova e devolvem 'aguardar'.
 * Um teto (`maxEsperaMs`) força o turno se o lead ficar mandando mensagens sem parar.
 */
export interface EstadoTurno {
  agora: number; // Date.now()
  ultimaEntradaEm: number | null; // createdAt (ms) da última mensagem 'in'
  ultimaSaidaEm: number | null; // createdAt (ms) da última 'out' (pode estar defasada — envio é assíncrono)
  entradaMaisAntigaNaoRespondidaEm: number | null; // 'in' mais antiga após a última 'out'
  debounceMs: number;
  maxEsperaMs: number;
}

export type DecisaoTurno = 'rodar' | 'aguardar' | 'nada';

export function decidirTurno(e: EstadoTurno): DecisaoTurno {
  // Nada recebido → nada a responder.
  if (e.ultimaEntradaEm == null) return 'nada';

  // Já respondido: a última saída é posterior (ou igual) à última entrada. Best-effort
  // (a 'out' é persistida só após o envio, então pode estar defasada — no pior caso a
  // checagem de silêncio abaixo evita o turno duplicado de qualquer forma).
  if (e.ultimaSaidaEm != null && e.ultimaSaidaEm >= e.ultimaEntradaEm) return 'nada';

  // Silêncio suficiente desde a última mensagem do lead → ele parou de digitar.
  const silencioMs = e.agora - e.ultimaEntradaEm;
  if (silencioMs >= e.debounceMs) return 'rodar';

  // Teto: mesmo sem silêncio, não segurar a resposta além de maxEsperaMs desde a
  // primeira mensagem ainda não respondida (lead que manda mensagens sem pausa).
  const esperandoDesde = e.entradaMaisAntigaNaoRespondidaEm ?? e.ultimaEntradaEm;
  if (e.agora - esperandoDesde >= e.maxEsperaMs) return 'rodar';

  return 'aguardar';
}
