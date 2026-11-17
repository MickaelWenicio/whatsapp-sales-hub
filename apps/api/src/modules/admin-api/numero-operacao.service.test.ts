import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { NumeroOperacaoService } from './numero-operacao.service';

function ambiente(opts: { existente?: any; historico?: number } = {}) {
  const criados: any[] = [];
  const atualizados: any[] = [];
  const apagados: string[] = [];
  const chamadas: string[] = [];
  const base = {
    id: 'n1',
    rotulo: 'Comercial',
    e164: '+5511999999999',
    instanciaEvolution: 'sales-hub-x',
    estado: 'desconectado',
    ultimoEstadoEm: null,
    ultimaFalha: null,
    ficticio: false,
  };
  const prisma: any = {
    whatsAppNumber: {
      findMany: async () => (opts.existente ? [{ ...base, ...opts.existente }] : []),
      findUnique: async () => ({ ...base, ...(opts.existente ?? {}) }),
      create: async ({ data }: any) => {
        criados.push(data);
        return { ...base, ...data, id: 'novo' };
      },
      update: async ({ data }: any) => {
        atualizados.push(data);
        return { ...base, ...data };
      },
      delete: async ({ where }: any) => {
        apagados.push(where.id);
      },
    },
    conversation: { count: async () => opts.historico ?? 0 },
    message: { count: async () => 0 },
    inboundEvent: { count: async () => 0 },
  };
  const channel: any = {
    criarInstancia: vi.fn(async (i: string) => void chamadas.push(`criar:${i}`)),
    configurarWebhook: vi.fn(async (i: string) => void chamadas.push(`webhook:${i}`)),
    desconectar: vi.fn(async (i: string) => void chamadas.push(`logout:${i}`)),
    removerInstancia: vi.fn(async (i: string) => void chamadas.push(`remover:${i}`)),
  };
  const audit: any = { registrar: vi.fn(async () => undefined) };
  const eventos: any = { publicar: vi.fn(async () => undefined) };
  return {
    service: new NumeroOperacaoService(prisma, audit, eventos, channel),
    channel,
    audit,
    eventos,
    criados,
    atualizados,
    apagados,
    chamadas,
  };
}

describe('NumeroOperacaoService', () => {
  it('recusa com 409 quando já existe um número da operação', async () => {
    const a = ambiente({ existente: { id: 'n1', e164: '+5511988887777' } });
    await expect(
      a.service.criar({ rotulo: 'Comercial', e164: '(11) 99999-0000' }, 'u1'),
    ).rejects.toMatchObject({ status: 409 });
    expect(a.channel.criarInstancia).not.toHaveBeenCalled();
  });

  it('cria a instância, configura o webhook e grava o número desconectado', async () => {
    const a = ambiente();
    const dto = await a.service.criar({ rotulo: 'Comercial', e164: '(11) 99999-0000' }, 'u1');
    expect(a.chamadas[0]).toMatch(/^criar:sales-hub-comercial-/);
    expect(a.chamadas[1]).toMatch(/^webhook:sales-hub-comercial-/);
    expect(a.criados[0]).toMatchObject({ e164: '+5511999990000', estado: 'desconectado' });
    expect(dto.estado).toBe('desconectado');
    expect(a.audit.registrar).toHaveBeenCalledWith(
      expect.objectContaining({ ator: 'usuario_painel:u1', acao: 'numero_operacao.criar' }),
    );
    expect(a.eventos.publicar).toHaveBeenCalledWith('number.status', expect.anything());
  });

  it('atualiza a linha placeholder reaproveitando a instância', async () => {
    const a = ambiente({ existente: { id: 'n1', e164: '+5500900000000' } });
    await a.service.criar({ rotulo: 'Comercial', e164: '(82) 99999-0000' }, 'u1');
    expect(a.chamadas).toEqual(['criar:sales-hub-x', 'webhook:sales-hub-x']);
    expect(a.criados).toEqual([]);
    expect(a.atualizados[0]).toMatchObject({ e164: '+5582999990000', rotulo: 'Comercial' });
  });

  it('rejeita telefone inválido', async () => {
    const a = ambiente();
    await expect(a.service.criar({ rotulo: 'Comercial', e164: '123' }, 'u1')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('remove a linha quando não há histórico', async () => {
    const a = ambiente();
    await a.service.remover('n1', 'u1');
    expect(a.chamadas).toEqual(['remover:sales-hub-x']);
    expect(a.apagados).toEqual(['n1']);
  });

  it('desanexa em vez de apagar quando há histórico', async () => {
    const a = ambiente({ historico: 3 });
    await a.service.remover('n1', 'u1');
    expect(a.apagados).toEqual([]);
    expect(a.chamadas).toEqual(['logout:sales-hub-x']);
    expect(a.atualizados[0]).toMatchObject({ e164: '+5500900000000', estado: 'desconectado' });
    expect(a.atualizados[0].instanciaEvolution).toBeUndefined();
    expect(a.eventos.publicar).toHaveBeenCalledWith('number.status', expect.anything());
  });
});
