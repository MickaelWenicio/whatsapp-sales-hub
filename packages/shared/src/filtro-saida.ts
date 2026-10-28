export type ResultadoFiltro =
  | { ok: true }
  | { ok: false; motivo: 'termo_proibido' | 'desconto' | 'valor_nao_aprovado'; termo?: string };

function normalizar(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function escaparRegex(t: string): string {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Percentual só bloqueia perto (~25 caracteres) de palavra de desconto: "100% pelo aplicativo" passa.
const DESCONTO =
  /\d+\s?%[\s\S]{0,25}\b(desconto|off|abatimento|promocao|cupom)\b|\b(desconto|off|abatimento|promocao|cupom)\b[\s\S]{0,25}\d+\s?%|\bdesconto\b/;
const VALOR = /R\$\s?(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{2}))?/g;

/**
 * Confere uma bolha do agente antes do envio.
 * - `valoresPermitidosCentavos`: só esses valores em R$ podem aparecer (os preços aprovados do catálogo).
 * - `termosProibidos`: palavras ou expressões que a empresa não quer que o agente use (ex.: por regra do
 *   setor ou de marca). A comparação ignora maiúsculas e acentos e respeita os limites de palavra.
 */
export function filtrarBolha(
  texto: string,
  valoresPermitidosCentavos: number[],
  termosProibidos: readonly string[] = [],
): ResultadoFiltro {
  const t = normalizar(texto);
  for (const termo of termosProibidos) {
    const n = normalizar(termo).trim();
    if (n && new RegExp(`\\b${escaparRegex(n)}\\b`).test(t)) return { ok: false, motivo: 'termo_proibido', termo };
  }
  if (DESCONTO.test(t)) return { ok: false, motivo: 'desconto' };
  for (const m of texto.matchAll(VALOR)) {
    const reais = Number(m[1]!.replace(/\./g, ''));
    const centavos = reais * 100 + (m[2] ? Number(m[2]) : 0);
    if (!valoresPermitidosCentavos.includes(centavos)) return { ok: false, motivo: 'valor_nao_aprovado' };
  }
  return { ok: true };
}

/** Lê a lista de termos proibidos de uma string separada por vírgulas (ex.: variável de ambiente). */
export function lerTermosProibidos(bruto: string | undefined | null): string[] {
  return (bruto ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}
