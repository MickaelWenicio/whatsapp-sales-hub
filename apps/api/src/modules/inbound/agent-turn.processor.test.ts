import type { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SettingsService } from '../security/settings.service';
import { AgentTurnProcessor, type AgentTurnJob } from './agent-turn.processor';
import type { Orquestrador } from './orquestrador.token';
import type { TurnoLockService } from './turno-lock.service';

interface Msg {
  autor: 'cliente' | 'ia' | 'atendente' | 'sistema';
  tipo?: string;
  texto: string;
  criadaEm: Date;
}

const T0 = new Date('2026-11-11T12:00:00.000Z').getTime();

function montar(opts: { mensagens: Msg[]; lockLivre?: boolean; estado?: string; iaGlobal?: boolean }) {
  const mensagens = opts.mensagens;
  const prisma = {
    conversation: { findUnique: vi.fn(async () => ({ estado: opts.estado ?? 'IA_ATIVA' })) },
    message: {
      findFirst: vi.fn(async (args: { where: { autor: unknown; criadaEm?: { gt: Date } } }) => {
        if (args.where.autor === 'cliente') {
          const clientes = mensagens.filter((x) => x.autor === 'cliente');
          if (!args.where.criadaEm) {
            const ult = clientes.at(-1);
            return ult ? { id: `m${mensagens.indexOf(ult)}`, criadaEm: ult.criadaEm } : null;
          }
          const gt = args.where.criadaEm.gt.getTime();
          const m = clientes.find((x) => x.criadaEm.getTime() > gt);
          return m ? { criadaEm: m.criadaEm } : null;
        }
        const autores = (args.where.autor as { in: string[] }).in;
        const saidas = mensagens.filter((m) => autores.includes(m.autor) && (m.tipo ?? 'texto') === 'texto');
        return saidas.length ? { criadaEm: saidas[saidas.length - 1]!.criadaEm } : null;
      }),
      findMany: vi.fn(async (args: { where: { criadaEm?: { gt: Date } } }) => {
        const gt = args.where.criadaEm?.gt.getTime() ?? -Infinity;
        return mensagens
          .filter((m) => m.autor === 'cliente' && m.criadaEm.getTime() > gt)
          .map((m) => ({ ...m, tipo: m.tipo ?? 'texto' }));
      }),
    },
  } as unknown as PrismaService;

  let liberar!: () => void;
  const bloqueio = new Promise<void>((r) => (liberar = r));
  const processar = vi.fn(() => bloqueio.then(() => 'respondido' as const));
  const orquestrador = { processar } as unknown as Orquestrador;

  // Trava com semântica real: um dono por vez, token, marcador de visto.
  let dono: string | null = null;
  let visto: number | null = null;
  let n = 0;
  const lock = {
    adquirir: vi.fn(async () => {
      if (opts.lockLivre === false || dono) return null;
      dono = `tok${++n}`;
      return dono;
    }),
    liberar: vi.fn(async (_id: string, token: string) => {
      if (dono === token) dono = null;
    }),
    renovar: vi.fn(async () => true),
    marcarVisto: vi.fn(async (_id: string, ate: number) => {
      visto = ate;
    }),
    lerVisto: vi.fn(async () => visto),
  } as unknown as TurnoLockService;
  const add = vi.fn(async (..._a: unknown[]) => undefined);
  const fila = { add } as unknown as Queue<AgentTurnJob>;
  const settings = { iaGlobalAtiva: vi.fn(async () => opts.iaGlobal ?? true) } as unknown as SettingsService;
  const cfg: Record<string, number> = { AGENT_DEBOUNCE_MS: 3000, AGENT_DEBOUNCE_MAX_MS: 20_000 };
  const config = { get: (k: string) => cfg[k] } as unknown as ConfigService;

  const proc = new AgentTurnProcessor(prisma, orquestrador, lock, fila, settings, config);
  return { proc, processar, lock, add, liberar: () => liberar(), orquestrador };
}

const job = { id: '1', data: { conversationId: 'c1' } } as Job<AgentTurnJob>;
const cliente = (texto: string, ms: number): Msg => ({ autor: 'cliente', texto, criadaEm: new Date(T0 + ms) });

describe('AgentTurnProcessor', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('duas entradas em 2s geram um único turno', async () => {
    const { proc, processar, liberar } = montar({ mensagens: [cliente('oi', 0), cliente('quero o plano completo', 2000)] });
    liberar();
    // job da 1a mensagem dispara em T0+3s: a 2a (T0+2s) é mais nova, silêncio de 1s -> aguardar
    vi.setSystemTime(T0 + 3000);
    await proc.process(job);
    expect(processar).not.toHaveBeenCalled();
    // job da 2a mensagem dispara em T0+5s -> roda
    vi.setSystemTime(T0 + 5000);
    await proc.process(job);
    expect(processar).toHaveBeenCalledTimes(1);
  });

  it('com trava ocupada, re-agenda com delay e não chama o orquestrador', async () => {
    const { proc, processar, add } = montar({ mensagens: [cliente('oi', 0)], lockLivre: false });
    vi.setSystemTime(T0 + 10_000);
    await proc.process(job);
    expect(processar).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledTimes(1);
    const [nome, dados, opts] = add.mock.calls[0] as unknown as [string, unknown, { delay: number; jobId: string }];
    expect(nome).toBe('turn');
    expect(dados).toEqual({ conversationId: 'c1', espera: 1 });
    expect(opts.delay).toBe(3000);
    expect(opts.jobId).toBe('turn.c1.espera.m0.1');
    expect(opts.jobId).not.toContain(':');
  });

  it('espera com backoff (teto 15 s) e jobId por nível, sem job novo a cada 3 s', async () => {
    const { proc, add } = montar({ mensagens: [cliente('oi', 0)], lockLivre: false });
    const delays: number[] = [];
    const ids: string[] = [];
    for (let espera = 0; espera < 6; espera++) {
      await proc.process({ id: 'x', data: { conversationId: 'c1', espera } } as Job<AgentTurnJob>);
      const [, , o] = add.mock.calls.at(-1) as unknown as [string, unknown, { delay: number; jobId: string }];
      delays.push(o.delay);
      ids.push(o.jobId);
    }
    expect(delays).toEqual([3000, 6000, 12_000, 15_000, 15_000, 15_000]);
    expect(ids[0]).toBe('turn.c1.espera.m0.1');
    expect(ids[5]).toBe('turn.c1.espera.m0.6');
  });

  it('libera a trava (com o token) quando o orquestrador lança erro', async () => {
    const { proc, lock, orquestrador } = montar({ mensagens: [cliente('oi', 0)] });
    (orquestrador as unknown as { processar: unknown }).processar = vi.fn().mockRejectedValue(new Error('boom'));
    vi.setSystemTime(T0 + 10_000);
    await expect(proc.process(job)).rejects.toThrow('boom');
    expect(lock.liberar).toHaveBeenCalledWith('c1', 'tok1');
  });

  it('libera a trava também quando decide não rodar', async () => {
    const { proc, lock, processar } = montar({ mensagens: [cliente('oi', 0)] });
    vi.setSystemTime(T0 + 1000);
    await proc.process(job);
    expect(processar).not.toHaveBeenCalled();
    expect(lock.liberar).toHaveBeenCalledWith('c1', 'tok1');
  });

  it('rajada contínua roda no teto de 20s', async () => {
    const msgs: Msg[] = [];
    for (let s = 0; s <= 19; s += 2) msgs.push(cliente(`m${s}`, s * 1000)); // última em T0+18s
    const { proc, processar, liberar } = montar({ mensagens: msgs });
    liberar();
    vi.setSystemTime(T0 + 19_000); // 1s de silêncio, 19s desde a 1a
    await proc.process(job);
    expect(processar).not.toHaveBeenCalled();
    vi.setSystemTime(T0 + 20_500); // 2,5s de silêncio, mas 20,5s desde a 1a
    await proc.process(job);
    expect(processar).toHaveBeenCalledTimes(1);
  });

  it('passa sinais de emergência e opt-out ao orquestrador', async () => {
    const { proc, processar, liberar } = montar({
      mensagens: [cliente('sofri um acidente, preciso de ajuda', 0), cliente('não me mande mais mensagem', 500)],
    });
    liberar();
    vi.setSystemTime(T0 + 10_000);
    await proc.process(job);
    expect(processar).toHaveBeenCalledWith('c1', { emergencia: true, interrupcao: true });
  });

  it('não roda quando a conversa não está IA_ATIVA ou a IA global está desligada', async () => {
    for (const o of [{ estado: 'HUMANO' }, { iaGlobal: false }]) {
      const { proc, processar, lock } = montar({ mensagens: [cliente('oi', 0)], ...o });
      vi.setSystemTime(T0 + 10_000);
      await proc.process(job);
      expect(processar).not.toHaveBeenCalled();
      expect(lock.liberar).toHaveBeenCalled();
    }
  });

  it('sem marcador, uma saída posterior à última entrada significa respondido', async () => {
    const { proc, processar } = montar({
      mensagens: [cliente('oi', 0), { autor: 'ia', texto: 'olá', criadaEm: new Date(T0 + 4000) }],
    });
    vi.setSystemTime(T0 + 10_000);
    await proc.process(job);
    expect(processar).not.toHaveBeenCalled();
  });

  it('sem mensagem nova durante o turno, não agenda outro', async () => {
    const { proc, add, liberar } = montar({ mensagens: [cliente('oi', 0)] });
    liberar();
    vi.setSystemTime(T0 + 10_000);
    await proc.process(job);
    expect(add).not.toHaveBeenCalled();
  });

  it('mensagem chegada durante o turno gera exatamente um segundo turno, nunca em paralelo', async () => {
    const mensagens: Msg[] = [cliente('m1', 0)];
    const { proc, add, lock, orquestrador } = montar({ mensagens });
    let emAndamento = 0;
    let maxParalelo = 0;
    let turnos = 0;
    let soltar!: () => void;
    const primeiroTurno = new Promise<void>((r) => (soltar = r));
    (orquestrador as unknown as { processar: unknown }).processar = vi.fn(async () => {
      turnos++;
      emAndamento++;
      maxParalelo = Math.max(maxParalelo, emAndamento);
      if (turnos === 1) await primeiroTurno;
      emAndamento--;
      return 'respondido';
    });

    vi.setSystemTime(T0 + 5000);
    const t1 = proc.process(job);
    await vi.waitFor(() => expect(turnos).toBe(1));

    // m2 e m3 chegam durante o turno; o job delas esbarra na trava e espera
    mensagens.push(cliente('m2', 6000), cliente('m3', 7000));
    vi.setSystemTime(T0 + 10_000);
    await proc.process(job);
    expect(turnos).toBe(1);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0]![2]).toMatchObject({ jobId: 'turn.c1.espera.m2.1' });

    // o turno termina e a resposta da IA é POSTERIOR a m2 e m3 (o bug antigo escondia m2/m3)
    mensagens.push({ autor: 'ia', texto: 'resp', criadaEm: new Date(T0 + 11_000) });
    vi.setSystemTime(T0 + 12_000);
    soltar();
    await t1;
    // ao final do turno 1 agenda UM novo turno com o debounce normal
    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[1]![1]).toEqual({ conversationId: 'c1' });
    expect(add.mock.calls[1]![2]).toMatchObject({ delay: 3000 });

    // o job agendado dispara depois do debounce: roda o 2o turno
    vi.setSystemTime(T0 + 16_000);
    await proc.process(job);
    expect(turnos).toBe(2);
    // o job de espera (de m2/m3) dispara em seguida: nada novo, não roda de novo
    vi.setSystemTime(T0 + 20_000);
    await proc.process({ id: 'e', data: { conversationId: 'c1', espera: 1 } } as Job<AgentTurnJob>);
    expect(turnos).toBe(2);
    expect(maxParalelo).toBe(1);
    expect(lock.marcarVisto).toHaveBeenLastCalledWith('c1', T0 + 7000);
  });

  it('orquestrador que lança não avança o marcador: o retry roda o turno e não agenda outro', async () => {
    const { proc, add, lock, orquestrador } = montar({ mensagens: [cliente('oi', 0)] });
    const processar = vi.fn().mockRejectedValueOnce(new Error('falhou')).mockResolvedValue('respondido');
    (orquestrador as unknown as { processar: unknown }).processar = processar;
    vi.setSystemTime(T0 + 10_000);
    await expect(proc.process(job)).rejects.toThrow('falhou');
    expect(lock.marcarVisto).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    // retry do BullMQ
    await proc.process(job);
    expect(processar).toHaveBeenCalledTimes(2);
    expect(lock.marcarVisto).toHaveBeenCalledWith('c1', T0);
  });

  it('humano assume, responde e devolve: a IA não reprocessa o que o humano já tratou', async () => {
    const mensagens: Msg[] = [cliente('oi', 0)];
    const { proc, processar, lock, liberar } = montar({ mensagens });
    liberar();
    vi.setSystemTime(T0 + 5000);
    await proc.process(job); // turno 1 vê m1; marcador = T0
    expect(processar).toHaveBeenCalledTimes(1);
    mensagens.push({ autor: 'ia', texto: 'olá', criadaEm: new Date(T0 + 6000) });
    // humano assume: cliente pede socorro, o atendente responde (posterior ao marcador)
    mensagens.push(cliente('sofri um acidente, preciso de ajuda', 10_000));
    mensagens.push({ autor: 'atendente', texto: 'já te ajudo', criadaEm: new Date(T0 + 12_000) });
    // devolve à IA; chega uma mensagem nova e neutra
    mensagens.push(cliente('obrigado', 30_000));
    vi.setSystemTime(T0 + 40_000);
    await proc.process(job);
    expect(processar).toHaveBeenCalledTimes(2);
    expect(processar).toHaveBeenLastCalledWith('c1', { emergencia: false, interrupcao: false });
    expect(lock.marcarVisto).toHaveBeenLastCalledWith('c1', T0 + 30_000);
  });

  it('humano assume, responde e devolve sem mensagem nova: não roda', async () => {
    const mensagens: Msg[] = [cliente('oi', 0)];
    const { proc, processar, liberar } = montar({ mensagens });
    liberar();
    vi.setSystemTime(T0 + 5000);
    await proc.process(job);
    mensagens.push(cliente('preciso de ajuda', 10_000));
    mensagens.push({ autor: 'atendente', texto: 'resolvido', criadaEm: new Date(T0 + 12_000) });
    vi.setSystemTime(T0 + 40_000);
    await proc.process(job);
    expect(processar).toHaveBeenCalledTimes(1);
  });
});
