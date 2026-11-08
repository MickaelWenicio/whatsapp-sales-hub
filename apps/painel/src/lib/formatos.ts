import { formatarTelefoneExibicao } from '@sales-hub/shared';

export { formatarTelefoneExibicao as formatarTelefone };

const TZ = 'America/Sao_Paulo';

const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const fmtDiaMes = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TZ });
const fmtChaveDia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });

/** "R$ 1.234,56" */
export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

export function formatarNumero(valor: number): string {
  return new Intl.NumberFormat('pt-BR').format(valor);
}

/** 0.123 vira "12,3%" */
export function formatarPercentual(fracao: number, casas = 1): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: casas,
  }).format(fracao);
}

/** Minutos viram "45 min", "2 h 10 min". */
export function formatarDuracaoMin(minutos: number): string {
  const m = Math.round(minutos);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  return resto === 0 ? `${h} h` : `${h} h ${resto} min`;
}

/** Hora local "14:20". */
export function formatarHora(iso: string): string {
  return fmtHora.format(new Date(iso));
}

/**
 * Datas relativas até 7 dias ("agora", "há 3 min", "há 2 h", "ontem, 14:20", "há 3 dias");
 * depois disso "12/11, 14:20".
 */
export function formatarDataRelativa(iso: string | null | undefined, agora: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  const dif = agora.getTime() - d.getTime();
  if (dif < 0) {
    const chave = fmtChaveDia.format(d);
    if (chave === fmtChaveDia.format(agora)) return `hoje, ${fmtHora.format(d)}`;
    const amanha = new Date(agora.getTime() + 86_400_000);
    if (chave === fmtChaveDia.format(amanha)) return `amanhã, ${fmtHora.format(d)}`;
    return `${fmtDiaMes.format(d)}, ${fmtHora.format(d)}`;
  }
  const min = Math.floor(dif / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24 && fmtChaveDia.format(d) === fmtChaveDia.format(agora)) return `há ${h} h`;
  const ontem = new Date(agora.getTime() - 86_400_000);
  if (fmtChaveDia.format(d) === fmtChaveDia.format(ontem)) return `ontem, ${fmtHora.format(d)}`;
  const dias = Math.floor(dif / 86_400_000);
  if (dias <= 7) return `há ${Math.max(dias, 2)} dias`;
  return `${fmtDiaMes.format(d)}, ${fmtHora.format(d)}`;
}

export function iniciais(nome: string | null | undefined): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '';
  const a = partes[0][0] ?? '';
  const b = partes.length > 1 ? (partes[partes.length - 1][0] ?? '') : '';
  return (a + b).toUpperCase();
}

export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] ?? '';
}

/** Rótulos do catálogo genérico da demonstração (mesmos slugs do seed). */
export const ROTULOS_PRODUTO: Record<string, string> = {
  'plano-essencial': 'Plano Essencial',
  'plano-completo': 'Plano Completo',
  'solucoes-empresas': 'Soluções para Empresas',
};

/** Nome do produto pelo slug; slugs fora do catálogo aparecem legíveis. */
export function rotuloProduto(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return (
    ROTULOS_PRODUTO[slug] ??
    slug.replace(/[-_]+/g, ' ').replace(/^\p{L}/u, (l) => l.toUpperCase())
  );
}

/** "Plano residencial · 2 unidades" a partir do item de interesse. */
export function descreverItem(
  item: { categoria: string | null; descricao: string | null } | null | undefined,
): string | null {
  if (!item) return null;
  return [item.categoria, item.descricao].filter(Boolean).join(' · ') || null;
}
