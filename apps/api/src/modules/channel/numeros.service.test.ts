import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { EvolutionAdapter } from './adapters/evolution.adapter';
import type { EstadoConexaoCanal } from './channel.port';
import { NumerosService } from './numeros.service';

function montar(
  inicial: Record<string, unknown>,
  estado: EstadoConexaoCanal,
  dono: string | null,
  extra: { donoLanca?: boolean } = {},
) {
  const linha: Record<string, unknown> = {
    id: 'n1',
    rotulo: 'Comercial',
    e164: '+5500900000000',
    instanciaEvolution: 'sales-hub',
    estado: 'desconectado',
    ultimoEstadoEm: null,
    ultimaFalha: null,
    ficticio: false,
    ...inicial,
  };
  const prisma = {
    whatsAppNumber: {
      findMany: vi.fn(async () => [{ ...linha }]),
      findUnique: vi.fn(async () => ({ ...linha })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(linha, data)),
    },
  };
  const publicar = vi.fn(async () => undefined);
  const registrar = vi.fn(async () => undefined);
  const health = { verificar: vi.fn(async () => ({ estado, verificadoEm: 'x' })) };
  const channel = {
    numeroDaInstancia: vi.fn(async () => {
      if (extra.donoLanca) throw new Error('boom');
      return dono;
    }),
  };
  const config = { get: () => 'web' } as unknown as ConfigService;
  const svc = new NumerosService(
    prisma as never,
    { registrar } as never,
    { publicar } as never,
    health as never,
    channel as never,
    config,
  );
  return { svc, prisma, publicar, registrar, linha };
}

describe('NumerosService.sincronizar', () => {
  it('conectado com dono diferente: atualiza e164 e publica number.status uma vez', async () => {
    const { svc, linha, publicar } = montar({}, 'conectado', '+5511900000099');
    await svc.sincronizar();
    expect(linha.e164).toBe('+5511900000099');
    expect(linha.estado).toBe('conectado');
    expect(publicar).toHaveBeenCalledTimes(1);
    expect(publicar).toHaveBeenCalledWith('number.status', {
      numero: expect.objectContaining({ id: 'n1', e164: '+5511900000099', estado: 'conectado' }),
    });
  });

  it('e164 igual e estado igual: não publica', async () => {
    const { svc, publicar } = montar({ estado: 'conectado', e164: '+5511900000099' }, 'conectado', '+5511900000099');
    await svc.sincronizar();
    expect(publicar).not.toHaveBeenCalled();
  });

  it('só e164 mudou (estado igual): publica uma vez', async () => {
    const { svc, publicar } = montar({ estado: 'conectado' }, 'conectado', '+5511900000099');
    await svc.sincronizar();
    expect(publicar).toHaveBeenCalledTimes(1);
  });

  it('Evolution inalcançável: grava desconectado com ultimaFalha e o DTO sai como erro', async () => {
    const { svc, linha, publicar } = montar({ estado: 'conectado' }, 'erro', null);
    await svc.sincronizar();
    expect(linha.estado).toBe('desconectado');
    expect(linha.ultimaFalha).toEqual(expect.any(String));
    expect(publicar).toHaveBeenCalledWith('number.status', { numero: expect.objectContaining({ estado: 'erro' }) });
  });

  it('número fictício não é consultado', async () => {
    const { svc, prisma } = montar({ ficticio: true }, 'conectado', null);
    await svc.sincronizar();
    expect(prisma.whatsAppNumber.findMany).toHaveBeenCalledWith({ where: { ficticio: false } });
  });

  it('nunca lança, mesmo com falha no canal', async () => {
    const { svc } = montar({}, 'conectado', null, { donoLanca: true });
    await expect(svc.sincronizar()).resolves.toBeUndefined();
  });
});

describe('EvolutionAdapter.estadoConexao', () => {
  it('Evolution inalcançável devolve erro (sem lançar)', async () => {
    const config = {
      get: (k: string) => (k === 'EVOLUTION_API_URL' ? 'http://127.0.0.1:1' : 'k'),
    } as unknown as ConfigService;
    expect(await new EvolutionAdapter(config).estadoConexao('sales-hub')).toEqual({ estado: 'erro' });
  });
});

describe('EvolutionAdapter.numeroDaInstancia', () => {
  it('só lê o dono da instância pedida', async () => {
    const config = { get: () => 'x' } as unknown as ConfigService;
    const a = new EvolutionAdapter(config);
    const get = vi.fn(async () => ({
      data: [
        { name: 'outra', ownerJid: '5511999998888@s.whatsapp.net' },
        { name: 'sales-hub', ownerJid: '5511900000099@s.whatsapp.net' },
      ],
    }));
    (a as unknown as { http: { get: unknown } }).http = { get };
    expect(await a.numeroDaInstancia('sales-hub')).toBe('+5511900000099');
    expect(await a.numeroDaInstancia('inexistente')).toBeNull();
  });
});
