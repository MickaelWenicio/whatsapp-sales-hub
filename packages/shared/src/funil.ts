import { ETAPAS, type Etapa, type TipoAtor } from './enums';

export type ResultadoMover = { ok: true } | { ok: false; motivo: string };

const no = (motivo: string): ResultadoMover => ({ ok: false, motivo });
const idx = (e: Etapa) => ETAPAS.indexOf(e);

export function podeMover(de: Etapa, para: Etapa, ator: TipoAtor): ResultadoMover {
  if (de === para) return no('A oportunidade já está nesta etapa.');

  if (de === 'venda_confirmada') {
    if (ator !== 'humano') return no('Só uma pessoa pode alterar uma venda confirmada.');
    return para === 'contratacao_em_andamento' ? { ok: true } : no('Uma venda confirmada só volta uma etapa.');
  }

  if (para === 'novo_lead' && ator !== 'sistema') return no('Só o sistema move para novo lead.');
  if (para === 'venda_confirmada' && ator !== 'humano') return no('Só uma pessoa confirma a venda.');
  if (para === 'proposta_enviada' && ator === 'ia') return no('A proposta é enviada pelo sistema ou por uma pessoa.');

  if (para === 'perdido') return { ok: true };
  if (de === 'perdido') {
    return para === 'em_atendimento' ? { ok: true } : no('Uma oportunidade perdida só volta para em atendimento.');
  }

  const delta = idx(para) - idx(de);
  if (delta > 0 || delta === -1) return { ok: true };
  return no('Só é possível avançar ou voltar uma etapa.');
}

export function exigeMotivo(para: Etapa): boolean {
  return para === 'perdido';
}

export function exigeEvidencia(para: Etapa): boolean {
  return para === 'venda_confirmada';
}
