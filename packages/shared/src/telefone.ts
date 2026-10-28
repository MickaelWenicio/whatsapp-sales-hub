/**
 * Normalização de telefone BR → E.164, para a indicação do corretor (ele digita o
 * número do interessado em formato livre: "48 99104-1186", "(48) 99104 1186",
 * "5548991041186", "+55 48 99104-1186"…). Retorna null quando não dá para rotear
 * com segurança (ex.: número sem DDD) — aí o agente pede o número de novo.
 *
 * Regras (Brasil): E.164 = +55 + DDD(2) + assinante(8 ou 9). Celular = 11 dígitos
 * após o país (DDD + 9 dígitos); fixo = 10. Sem 55, aceitamos 10–11 dígitos e
 * prefixamos 55. Com 55, exigimos 12–13 dígitos no total.
 */
const E164_BR = /^\+55\d{10,11}$/;

export function normalizarTelefoneBr(entrada: string | null | undefined): string | null {
  if (!entrada) return null;
  const raw = String(entrada).trim();
  let d = raw.replace(/\D/g, '');
  if (!d) return null;

  // Prefixo internacional EXPLÍCITO (+ ou 00): se não for Brasil (55), rejeita — não
  // coage número estrangeiro em BR (ex.: +1 202 555 0173 viraria um +55… plausível).
  const internacionalExplicito = raw.startsWith('+') || d.startsWith('00');
  if (d.startsWith('00')) d = d.slice(2);
  if (internacionalExplicito && !d.startsWith('55')) return null;

  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    // já vem com código do país (55 + 10/11)
  } else if (!internacionalExplicito && (d.length === 10 || d.length === 11)) {
    d = `55${d}`; // DDD + assinante, sem país
  } else {
    return null; // curto/longo demais ou ambíguo
  }

  // valida a forma BR: DDD 11–99 e, se celular (9 dígitos), começa com 9.
  const ddd = Number(d.slice(2, 4));
  const assinante = d.slice(4);
  if (ddd < 11 || ddd > 99) return null;
  if (assinante.length === 9 && !assinante.startsWith('9')) return null;

  const e164 = `+${d}`;
  return E164_BR.test(e164) ? e164 : null;
}

/**
 * E.164 → forma legível BR "(48) 99104-1186", para campos de ficha lidos por gente
 * (Larissa, Alude, dossiê). Devolve a entrada intacta se não for um E.164 BR.
 */
export function formatarTelefoneBr(e164: string | null | undefined): string {
  const n = normalizarTelefoneBr(e164);
  if (!n) return (e164 ?? '').trim();
  const ddd = n.slice(3, 5);
  const assinante = n.slice(5);
  const corte = assinante.length === 9 ? 5 : 4;
  return `(${ddd}) ${assinante.slice(0, corte)}-${assinante.slice(corte)}`;
}

/** Compara dois telefones pela forma normalizada (evita o corretor se auto-indicar). */
export function mesmoNumero(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarTelefoneBr(a) ?? a ?? null;
  const nb = normalizarTelefoneBr(b) ?? b ?? null;
  if (na === null || nb === null) return false;
  if (na === nb) return true;
  // WhatsApp/Evolution entrega JIDs BR sem o 9 do celular (ex.: 558294357540 para
  // +55 82 99435-7540): mesmo +55 e DDD, e o local de 9 dígitos sem o 9 inicial.
  return semNonoDigito(na) === semNonoDigito(nb);
}

function semNonoDigito(e164: string): string {
  const m = /^\+55(\d{2})(\d{8,9})$/.exec(e164);
  if (!m) return e164;
  const local = m[2]!.length === 9 && m[2]!.startsWith('9') ? m[2]!.slice(1) : m[2]!;
  return `+55${m[1]}${local}`;
}

/** Faixa ficticia da demonstracao: +55 00 9xxxx-xxxx (DDD 00 nao existe). */
export function ehNumeroFicticio(e164: string): boolean {
  return /^\+5500\d{9}$/.test(e164);
}

/** Exibicao no painel: "+55 (DD) 9XXXX-XXXX". Ficticios aparecem com DDD 11. */
export function formatarTelefoneExibicao(e164: string): string {
  if (ehNumeroFicticio(e164)) {
    const a = e164.slice(5);
    return `+55 (11) ${a.slice(0, 5)}-${a.slice(5)}`;
  }
  const n = normalizarTelefoneBr(e164);
  if (!n) return e164;
  return `+55 ${formatarTelefoneBr(n)}`;
}
