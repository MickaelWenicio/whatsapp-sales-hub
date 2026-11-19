import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { ActorGuard, RolesGuard } from './rbac';
import { RecuperacaoController } from './recuperacao.controller';
import { promptRecuperacao, RecuperacaoService } from './recuperacao.service';

const MODELO = 'Oi, {nome}! Você chegou a avaliar a proposta de {interesse}?';

function criar(parse: ReturnType<typeof vi.fn>, chave: string | null = 'k') {
  const valores: Record<string, string | null> = { ANTHROPIC_API_KEY: chave, AGENT_TERMOS_PROIBIDOS: 'garantido' };
  const config: any = { get: (k: string) => valores[k] ?? undefined };
  const s: any = new RecuperacaoService(config);
  s.client = { messages: { parse } };
  return s as RecuperacaoService;
}

describe('RecuperacaoController', () => {
  it('exige ator e papel', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, RecuperacaoController);
    expect(guards).toEqual(expect.arrayContaining([ActorGuard, RolesGuard]));
  });
  it('delega ao serviço', async () => {
    const svc: any = { gerarVariacoes: vi.fn().mockResolvedValue({ variacoes: [] }) };
    const c = new RecuperacaoController(svc);
    await c.variacoes({ a: 1 });
    expect(svc.gerarVariacoes).toHaveBeenCalledWith({ a: 1 });
  });
});

describe('RecuperacaoService', () => {
  it('filtra variações inválidas', async () => {
    const parse = vi.fn().mockResolvedValue({
      parsed_output: {
        variacoes: [
          { modeloIndex: 0, texto: 'E aí, {nome}! Ainda pensa na proposta de {interesse}?' },
          { modeloIndex: 0, texto: 'Resultado garantido com {interesse}' },
          { modeloIndex: 0, texto: 'Plano Essencial por R$ 49,90/mês' },
          { modeloIndex: 7, texto: 'fora do índice' },
        ],
      },
    });
    const r = await criar(parse).gerarVariacoes({ modelos: [MODELO], quantidade: 2 });
    expect(r.variacoes).toHaveLength(1);
    expect(r.variacoes[0]!.modeloIndex).toBe(0);
    const system = parse.mock.calls[0]![0].system as string;
    expect(system).toContain('para a Empresa Exemplo (Empresa de serviços por assinatura para pessoas e empresas)');
    expect(system).toContain('{nome} e {interesse}');
    expect(system).toContain('"garantido"');
  });
  it('prompt sem termos proibidos não cita lista', () => {
    expect(promptRecuperacao('Loja Teste', 'Vendemos planos.')).not.toMatch(/Nunca use estas palavras/);
  });
  it('503 sem chave', async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      criar(vi.fn(), null).gerarVariacoes({ modelos: [MODELO], quantidade: 1 }),
    ).rejects.toMatchObject({ status: 503 });
    if (prev) process.env.ANTHROPIC_API_KEY = prev;
  });
  it('502 em erro da API', async () => {
    const parse = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(
      criar(parse).gerarVariacoes({ modelos: [MODELO], quantidade: 1 }),
    ).rejects.toMatchObject({ status: 502 });
  });
  it('400 em corpo inválido', async () => {
    await expect(
      criar(vi.fn()).gerarVariacoes({ modelos: ['curto'], quantidade: 1 }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it.skipIf(process.env.RODAR_IA_REAL !== '1')(
    'chamada real',
    async () => {
      const config: any = { get: (k: string) => process.env[k] };
      const r = await new RecuperacaoService(config).gerarVariacoes({
        modelos: [MODELO],
        quantidade: 3,
      });
      console.log(JSON.stringify(r, null, 1));
      expect(r.variacoes.length).toBeGreaterThan(0);
    },
    60_000,
  );
});
