import { createHash } from 'node:crypto';

/**
 * Hash encadeado do audit_log (E4-T3 / P4). Cada registro encadeia o hash do
 * anterior → adulterar um registro quebra a cadeia a partir dele. Função pura
 * (testável); o material inclui o `createdAt` armazenado p/ ser recalculável.
 */
export interface CamposAuditoria {
  ator: string;
  acao: string;
  entidade?: string | null;
  entidadeId?: string | null;
  createdAt: string; // ISO 8601 (o mesmo gravado na linha)
}

export function calcularHashAuditoria(hashAnterior: string | null, c: CamposAuditoria): string {
  const material = [
    hashAnterior ?? '',
    c.ator,
    c.acao,
    c.entidade ?? '',
    c.entidadeId ?? '',
    c.createdAt,
  ].join('|');
  return createHash('sha256').update(material, 'utf8').digest('hex');
}
