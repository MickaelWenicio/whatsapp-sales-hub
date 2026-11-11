import { describe, expect, it } from 'vitest';
import { OutboundService } from './outbound.service';

describe('OutboundService reenviar recupera indisponibilidade da fila', () => {
  it('restaura falhou e permite nova tentativa se Redis rejeitar o enqueue', async () => {
    const message: any = {
      id: 'm1',
      conversationId: 'c1',
      autor: 'atendente',
      texto: 'Olá',
      status: 'falhou',
      motivoFalha: 'Canal desconectado',
    };
    const events: any[] = [];
    const jobs: any[] = [];
    let fail = true;
    const queue: any = {
      remove: async () => undefined,
      getJob: async () => null,
      add: async (_name: string, data: any, options: any) => {
        if (fail) throw new Error('Redis unavailable');
        jobs.push({ data, options });
      },
    };
    const prisma: any = {
      message: {
        findUnique: async () => message,
        updateMany: async ({ where, data }: any) => {
          if (message.id !== where.id || message.status !== where.status) return { count: 0 };
          Object.assign(message, data);
          return { count: 1 };
        },
      },
    };
    const eventos: any = {
      publicar: async (tipo: string, payload: any) => events.push({ tipo, payload }),
    };
    const service = new OutboundService(queue, prisma, eventos);
    await expect(service.reenviar('m1')).rejects.toMatchObject({ status: 503 });
    expect(message.status).toBe('falhou');
    expect(message.motivoFalha).toMatch(/fila/i);
    expect(events.at(-1)).toMatchObject({
      tipo: 'message.updated',
      payload: { mensagemId: 'm1', status: 'falhou' },
    });
    fail = false;
    await service.reenviar('m1');
    expect(message.status).toBe('pendente');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ data: { messageId: 'm1' }, options: { jobId: 'm1' } });
  });
});
