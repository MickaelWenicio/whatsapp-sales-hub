function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Só fatos consumados ou pedido de ajuda imediato; "medo de ser assaltado" não conta.
const EMERGENCIA: RegExp[] = [
  /\b(roubaram|furtaram|assaltaram|sequestraram)\b/,
  /\b(sofri|tive|sofremos|houve|aconteceu) (um |uma )?(acidente|roubo|furto|assalto)\b/,
  /\bsocorro\b/,
  /\bemergencia\b/,
];

const INTERRUPCAO: RegExp[] = [
  /\bpar(e|em|ar) de (me )?(mandar|enviar|escrever|chamar)\b/,
  /\bnao quero mais (receber|mensagem|mensagens|contato)\b/,
  /\bnao me (mande|envie|chame|escreva|procure)\b/,
  /\bsair da lista\b/,
  /\bdescadastr/,
  /\bremov(a|er) (o )?(meu )?(numero|contato)\b/,
];

export function preClassificar(texto: string): { emergencia: boolean; interrupcao: boolean } {
  const t = normalizar(texto);
  return {
    emergencia: EMERGENCIA.some((r) => r.test(t)),
    interrupcao: INTERRUPCAO.some((r) => r.test(t)),
  };
}
