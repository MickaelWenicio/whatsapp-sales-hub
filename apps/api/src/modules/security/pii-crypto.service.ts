import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifragem de PII em repouso (C4/C5 / Fase 2) — AES-256-GCM autenticado, por campo.
 * Protege CPF/RG/renda gravados no Postgres (colunas marcadas `TODO(C4): cifrar`).
 *
 * Contrato de segurança/operação:
 * - DESLIGADA por padrão (dev) = PASSTHROUGH: cifrar/decifrar são identidade. Todos os
 *   fluxos e testes seguem em texto plano sem mudança de comportamento.
 * - LIGADA (PII_ENCRYPTION_ENABLED=true + PII_ENCRYPTION_KEY de 32 bytes hex): grava
 *   ciphertext versionado `enc:1:<iv>:<tag>:<ct>` (base64). Em produção o env faz
 *   fail-closed (exige a chave válida) — ver env.ts.
 * - TOLERANTE A LEGADO: decifrar de um valor SEM o prefixo devolve o próprio valor
 *   (linhas gravadas antes de ligar a cifragem seguem legíveis; a re-cifragem é gradual
 *   ou por backfill). Ciphertext presente SEM chave => erro alto (config incoerente).
 *
 * A chave (KEK) vem do cofre/secret; rotação casa com o item S1/S2 já mapeado.
 */
const PREFIXO = 'enc:1:'; // versão do formato — habilita rotação/migração futura

@Injectable()
export class PiiCryptoService {
  private readonly logger = new Logger(PiiCryptoService.name);
  private readonly key: Buffer | null;
  readonly enabled: boolean;

  constructor(config: ConfigService) {
    const ligada = config.get<boolean>('PII_ENCRYPTION_ENABLED') ?? false;
    const hex = config.get<string>('PII_ENCRYPTION_KEY') ?? '';
    if (ligada && /^[0-9a-fA-F]{64}$/.test(hex)) {
      this.key = Buffer.from(hex, 'hex');
      this.enabled = true;
      this.logger.log('cifragem de PII em repouso ATIVA (AES-256-GCM)');
    } else {
      this.key = null;
      this.enabled = false;
      if (ligada) {
        this.logger.warn(
          'PII_ENCRYPTION_ENABLED=true mas a chave é inválida/ausente — operando em PASSTHROUGH (PII em claro)',
        );
      }
    }
  }

  /** Cifra um valor para repouso. Passthrough quando desligado; null/'' passam adiante. */
  cifrar(valor: string | null | undefined): string | null {
    if (valor == null || valor === '') return valor ?? null;
    if (!this.key) return valor; // passthrough (cifragem desligada)
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(valor, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${PREFIXO}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
  }

  /** Decifra um valor do repouso. Texto SEM o prefixo é tratado como legado em claro. */
  decifrar(valor: string | null | undefined): string | null {
    if (valor == null) return null;
    if (!valor.startsWith(PREFIXO)) return valor; // legado em claro / passthrough
    if (!this.key) {
      throw new Error('valor de PII cifrado encontrado, mas PII_ENCRYPTION_KEY não está configurada.');
    }
    const [ivB64, tagB64, ctB64] = valor.slice(PREFIXO.length).split(':');
    if (!ivB64 || !tagB64 || !ctB64) throw new Error('ciphertext de PII malformado.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  }
}
