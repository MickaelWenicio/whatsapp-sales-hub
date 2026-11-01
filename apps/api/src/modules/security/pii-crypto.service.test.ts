import type { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PiiCryptoService } from './pii-crypto.service';

const CHAVE = randomBytes(32).toString('hex'); // 64 chars hex

function comCifragem(overrides: Record<string, unknown> = {}): PiiCryptoService {
  const cfg: Record<string, unknown> = {
    PII_ENCRYPTION_ENABLED: true,
    PII_ENCRYPTION_KEY: CHAVE,
    ...overrides,
  };
  return new PiiCryptoService({ get: (k: string) => cfg[k] } as unknown as ConfigService);
}

function passthrough(): PiiCryptoService {
  return new PiiCryptoService({ get: () => undefined } as unknown as ConfigService);
}

describe('PiiCryptoService', () => {
  it('faz roundtrip (cifra → decifra) e o ciphertext não contém o texto plano', () => {
    const svc = comCifragem();
    expect(svc.enabled).toBe(true);
    const cpf = '529.982.247-25';
    const cifrado = svc.cifrar(cpf)!;
    expect(cifrado).toMatch(/^enc:1:/);
    expect(cifrado).not.toContain('529');
    expect(svc.decifrar(cifrado)).toBe(cpf);
  });

  it('cifra o MESMO valor em ciphertexts diferentes (IV aleatório), ambos decifram igual', () => {
    const svc = comCifragem();
    const a = svc.cifrar('5000')!;
    const b = svc.cifrar('5000')!;
    expect(a).not.toBe(b);
    expect(svc.decifrar(a)).toBe('5000');
    expect(svc.decifrar(b)).toBe('5000');
  });

  it('passthrough quando desligado: cifrar/decifrar são identidade', () => {
    const svc = passthrough();
    expect(svc.enabled).toBe(false);
    expect(svc.cifrar('52998224725')).toBe('52998224725');
    expect(svc.decifrar('52998224725')).toBe('52998224725');
  });

  it('desligado se a chave é inválida (não 32 bytes hex) → passthrough, não quebra', () => {
    const svc = comCifragem({ PII_ENCRYPTION_KEY: 'curta' });
    expect(svc.enabled).toBe(false);
    expect(svc.cifrar('x')).toBe('x');
  });

  it('decifra texto LEGADO (sem prefixo) devolvendo o próprio valor', () => {
    const svc = comCifragem();
    expect(svc.decifrar('11144477735')).toBe('11144477735'); // linha antiga em claro
  });

  it('null/vazio passam adiante sem cifrar', () => {
    const svc = comCifragem();
    expect(svc.cifrar(null)).toBeNull();
    expect(svc.cifrar('')).toBe(''); // vazio permanece vazio (nada a proteger)
    expect(svc.decifrar(null)).toBeNull();
  });

  it('ciphertext adulterado (GCM) falha na autenticação', () => {
    const svc = comCifragem();
    const cifrado = svc.cifrar('valor-sensivel')!;
    // corrompe o último caractere do ciphertext
    const adulterado = cifrado.slice(0, -1) + (cifrado.slice(-1) === 'A' ? 'B' : 'A');
    expect(() => svc.decifrar(adulterado)).toThrow();
  });

  it('ciphertext presente mas SEM chave (config incoerente) → erro alto', () => {
    const cifrado = comCifragem().cifrar('segredo')!;
    expect(() => passthrough().decifrar(cifrado)).toThrow(/PII_ENCRYPTION_KEY/);
  });
});
