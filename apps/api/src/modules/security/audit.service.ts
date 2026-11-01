import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { calcularHashAuditoria } from './audit.hash';

// chave fixa do advisory lock que serializa as escritas na cadeia de auditoria
const AUDIT_LOCK_KEY = 727_2727_2727n;

export interface EntradaAuditoria {
  ator: string; // 'agente' | 'usuario_painel:<id>' | ...
  acao: string;
  entidade?: string;
  entidadeId?: string;
  ip?: string;
}

/**
 * Trilha de auditoria append-only com hash encadeado (P4/RF-20). Cada escrita
 * relevante (dado, documento, decisão, transição) chama `registrar`.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(e: EntradaAuditoria): Promise<void> {
    // ler-último→calcular→inserir precisa ser atômico, senão dois escritores
    // concorrentes encadeiam no mesmo hash e forkam a cadeia. Serializa com um
    // advisory lock de transação (liberado no commit) — global por banco.
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`;
      const ultimo = await tx.auditLog.findFirst({
        orderBy: { seq: 'desc' },
        select: { hash: true },
      });
      const hashAnterior = ultimo?.hash ?? null;
      const at = new Date();
      const hash = calcularHashAuditoria(hashAnterior, {
        ator: e.ator,
        acao: e.acao,
        entidade: e.entidade,
        entidadeId: e.entidadeId,
        createdAt: at.toISOString(),
      });
      await tx.auditLog.create({
        data: {
          ator: e.ator,
          acao: e.acao,
          entidade: e.entidade,
          entidadeId: e.entidadeId,
          ip: e.ip,
          hashAnterior,
          hash,
          createdAt: at,
        },
      });
    });
  }

  /**
   * Percorre a cadeia (em ordem de inserção) e detecta adulteração.
   * Sem `desdeSeq`: verifica desde a gênese (exige hashAnterior=null na 1ª linha).
   * Com `desdeSeq`: verificação incremental de um sufixo — parte do hashAnterior
   * da 1ª linha do intervalo (não re-linka à gênese). Útil p/ conferir só as
   * entradas recentes sem varrer a trilha inteira.
   */
  async verificarIntegridade(opts?: {
    desdeSeq?: bigint;
  }): Promise<{ integro: boolean; quebradoEm?: string }> {
    const logs = await this.prisma.auditLog.findMany({
      where: opts?.desdeSeq !== undefined ? { seq: { gte: opts.desdeSeq } } : undefined,
      orderBy: { seq: 'asc' },
    });
    let anterior: string | null =
      opts?.desdeSeq !== undefined && logs.length > 0 ? logs[0].hashAnterior : null;
    for (const l of logs) {
      if (l.hashAnterior !== anterior) return { integro: false, quebradoEm: l.id };
      const esperado = calcularHashAuditoria(anterior, {
        ator: l.ator,
        acao: l.acao,
        entidade: l.entidade,
        entidadeId: l.entidadeId,
        createdAt: l.createdAt.toISOString(),
      });
      if (l.hash !== esperado) return { integro: false, quebradoEm: l.id };
      anterior = l.hash;
    }
    return { integro: true };
  }
}
