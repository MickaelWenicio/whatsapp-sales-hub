/** Nomes das filas BullMQ. */
export const QUEUES = {
  INBOUND: 'inbound-process',
  AGENT_TURN: 'agent-turn',
  OUTBOUND: 'outbound-send',
  RESUMO: 'resumo',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
