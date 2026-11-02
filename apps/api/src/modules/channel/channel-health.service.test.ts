import { describe, expect, it, vi } from 'vitest';
import { ChannelHealthService } from './channel-health.service';
import type { ChannelPort, EstadoConexaoCanal } from './channel.port';

function montar(estadoConexao: (instancia: string) => Promise<{ estado: EstadoConexaoCanal }>) {
  const canal = { estadoConexao: vi.fn(estadoConexao) } as unknown as ChannelPort;
  return { svc: new ChannelHealthService(canal), canal };
}

const aberto = { estado: 'conectado' as const };

describe('ChannelHealthService', () => {
  it('lê o canal e reporta o estado', async () => {
    const { svc } = montar(async () => aberto);
    const r = await svc.status('sales-hub');
    expect(r.estado).toBe('conectado');
    expect(r.verificadoEm).not.toBeNull();
  });

  it('usa cache dentro da janela (não bate no canal a cada chamada)', async () => {
    const { svc, canal } = montar(async () => aberto);
    await svc.status('a');
    await svc.status('a');
    await svc.status('a');
    expect(canal.estadoConexao).toHaveBeenCalledTimes(1);
  });

  it('cache é por instância', async () => {
    const { svc, canal } = montar(async (i) => ({ estado: i === 'a' ? 'conectado' : 'desconectado' }));
    expect((await svc.status('a')).estado).toBe('conectado');
    expect((await svc.status('b')).estado).toBe('desconectado');
    expect(canal.estadoConexao).toHaveBeenCalledTimes(2);
  });

  it('canal fora do ar → erro (nunca otimista)', async () => {
    const { svc } = montar(async () => ({ estado: 'erro' }));
    expect((await svc.status('a')).estado).toBe('erro');
  });

  it('exceção inesperada da porta não propaga: vira erro', async () => {
    const { svc } = montar(async () => {
      throw new Error('conexão recusada');
    });
    expect((await svc.status('a')).estado).toBe('erro');
  });

  it('verificar() ignora o cache e lê de novo', async () => {
    const { svc, canal } = montar(async () => aberto);
    await svc.status('a');
    await svc.verificar('a');
    expect(canal.estadoConexao).toHaveBeenCalledTimes(2);
  });

  it('leitura pendurada responde "erro" depois do teto de 4 s', async () => {
    vi.useFakeTimers();
    try {
      const { svc } = montar(() => new Promise(() => {})); // nunca resolve
      const p = svc.status('a');
      await vi.advanceTimersByTimeAsync(4_100);
      expect(await p).toMatchObject({ estado: 'erro', verificadoEm: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it('a leitura em voo atualiza o cache quando enfim volta', async () => {
    vi.useFakeTimers();
    try {
      let liberar: (e: { estado: EstadoConexaoCanal }) => void = () => {};
      const { svc, canal } = montar(() => new Promise((res) => (liberar = res)));
      const p = svc.status('a');
      await vi.advanceTimersByTimeAsync(4_100);
      expect((await p).estado).toBe('erro');

      liberar(aberto);
      await vi.advanceTimersByTimeAsync(0);
      expect((await svc.status('a')).estado).toBe('conectado');
      expect(canal.estadoConexao).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('verificar() com leitura pendurada devolve erro, não o estado antigo do cache', async () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      const { svc } = montar(() => (n++ === 0 ? Promise.resolve(aberto) : new Promise(() => {})));
      await svc.status('a'); // cache: conectado
      const p = svc.verificar('a');
      await vi.advanceTimersByTimeAsync(4_100);
      expect((await p).estado).toBe('erro');
    } finally {
      vi.useRealTimers();
    }
  });
});
