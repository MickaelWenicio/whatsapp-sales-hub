import type { TipoMensagem } from '@sales-hub/shared';
import type { EventoCanal } from '../channel.port';

/**
 * Normalização PURA do webhook da Evolution v2 em eventos canônicos.
 * Sem HTTP nem estado. Nunca lança: payload estranho devolve [].
 */

const SUFIXO_USUARIO = '@s.whatsapp.net';
/** Mensagens mais antigas que isto são histórico importado, não conversa viva. */
const JANELA_MAX_MS = 10 * 60 * 1000;

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** JID de usuário para E.164 (`+<dígitos>`); null para grupos, broadcast, @lid e inválidos. */
function jidParaE164(jid: unknown): string | null {
  const s = str(jid);
  if (!s || !s.endsWith(SUFIXO_USUARIO)) return null;
  const numero = s.slice(0, -SUFIXO_USUARIO.length).replace(/\D/g, '');
  return numero ? `+${numero}` : null;
}

/** remoteJid direto; se for @lid, usa a alternativa em @s.whatsapp.net. */
function telefoneDaKey(key: Obj): string | null {
  const direto = jidParaE164(key.remoteJid);
  if (direto) return direto;
  if (str(key.remoteJid)?.endsWith('@lid')) {
    return jidParaE164(key.remoteJidAlt) ?? jidParaE164(key.senderPn);
  }
  return null;
}

function tipoDeMensagem(messageType: string | undefined, message: Obj | undefined): TipoMensagem {
  switch (messageType) {
    case 'conversation':
    case 'extendedTextMessage':
      return 'texto';
    case 'imageMessage':
      return 'imagem';
    case 'videoMessage':
    case 'ptvMessage':
      return 'video';
    case 'documentMessage':
    case 'documentWithCaptionMessage':
      return 'documento';
    case 'audioMessage':
      return 'audio';
    case 'stickerMessage':
      return 'figurinha';
    default:
      break;
  }
  // messageType ausente: deduz pela chave presente em `message`.
  if (message) {
    if ('conversation' in message || 'extendedTextMessage' in message) return 'texto';
    if ('imageMessage' in message) return 'imagem';
    if ('videoMessage' in message) return 'video';
    if ('documentMessage' in message || 'documentWithCaptionMessage' in message) return 'documento';
    if ('audioMessage' in message) return 'audio';
    if ('stickerMessage' in message) return 'figurinha';
  }
  return 'texto';
}

function textoDaMensagem(m: Obj | undefined): string | undefined {
  if (!m) return undefined;
  return (
    str(m.conversation) ??
    str(obj(m.extendedTextMessage)?.text) ??
    str(obj(m.imageMessage)?.caption) ??
    str(obj(m.videoMessage)?.caption) ??
    str(obj(m.documentMessage)?.caption) ??
    str(obj(obj(obj(m.documentWithCaptionMessage)?.message)?.documentMessage)?.caption)
  );
}

function segundos(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
  const o = obj(v); // Long serializado: { low, high }
  if (o && typeof o.low === 'number') return o.low;
  return null;
}

function registros(data: unknown): Obj[] {
  const lista = Array.isArray(data) ? data : [data];
  return lista.map(obj).filter((o): o is Obj => !!o);
}

function normalizarMensagens(instancia: string, data: unknown, agora: Date): EventoCanal[] {
  const saida: EventoCanal[] = [];
  for (const d of registros(data)) {
    const key = obj(d.key);
    if (!key) continue;
    const idExterno = str(key.id);
    if (!idExterno) continue;
    const de = telefoneDaKey(key);
    if (!de) continue; // grupo, broadcast, @lid sem alternativa
    const message = obj(d.message);

    const reacao = obj(message?.reactionMessage);
    if (reacao) {
      const alvo = str(obj(reacao.key)?.id);
      const emoji = str(reacao.text);
      // reação removida chega com text vazio: não vira evento
      if (alvo && emoji) saida.push({ tipo: 'reacao', instancia, idExterno, alvoIdExterno: alvo, emoji });
      continue;
    }

    const ts = segundos(d.messageTimestamp);
    if (ts !== null && agora.getTime() - ts * 1000 > JANELA_MAX_MS) continue; // histórico importado
    const timestamp = new Date(ts !== null ? ts * 1000 : agora.getTime()).toISOString();

    const fromMe = key.fromMe === true;
    const texto = textoDaMensagem(message);
    const pushName = typeof d.pushName === 'string' ? d.pushName.trim() : '';
    saida.push({
      tipo: 'mensagem',
      instancia,
      de,
      idExterno,
      fromMe,
      tipoMensagem: tipoDeMensagem(str(d.messageType), message),
      ...(texto ? { texto } : {}),
      // pushName só vale para mensagem recebida; em fromMe é a nossa própria conta
      ...(pushName && !fromMe ? { pushName } : {}),
      timestamp,
    });
  }
  return saida;
}

type StatusEntrega = 'enviada' | 'entregue' | 'lida';

const STATUS: Record<string, StatusEntrega> = {
  SERVER_ACK: 'enviada',
  DELIVERY_ACK: 'entregue',
  READ: 'lida',
  PLAYED: 'lida',
};

function normalizarStatus(instancia: string, data: unknown): EventoCanal[] {
  const saida: EventoCanal[] = [];
  for (const d of registros(data)) {
    const idExterno = str(obj(d.key)?.id) ?? str(d.keyId);
    const bruto = str(obj(d.update)?.status) ?? str(d.status);
    const status = bruto ? STATUS[bruto.toUpperCase()] : undefined;
    if (idExterno && status) saida.push({ tipo: 'status', instancia, idExterno, status });
  }
  return saida;
}

function normalizarConexao(instancia: string, data: unknown): EventoCanal[] {
  const state = str(obj(Array.isArray(data) ? data[0] : data)?.state);
  const estado =
    state === 'open' ? 'conectado' : state === 'close' ? 'desconectado' : state === 'connecting' ? 'reconectando' : null;
  return estado ? [{ tipo: 'conexao', instancia, estado }] : [];
}

function normalizarContatos(instancia: string, data: unknown): EventoCanal[] {
  const saida: EventoCanal[] = [];
  for (const c of registros(data)) {
    const de = jidParaE164(c.remoteJid ?? c.id);
    if (!de) continue;
    const pushName = (str(c.pushName) ?? str(c.notify) ?? '').trim();
    saida.push({ tipo: 'contato', instancia, de, ...(pushName ? { pushName } : {}) });
  }
  return saida;
}

export function normalizarEvento(raw: unknown, agora: Date): EventoCanal[] {
  try {
    const evt = obj(raw);
    if (!evt) return [];
    const nome = str(evt.event)?.toLowerCase().replace(/_/g, '.');
    const instancia = str(evt.instance);
    if (!nome || !instancia || evt.data === undefined || evt.data === null) return [];

    if (nome === 'messages.upsert') return normalizarMensagens(instancia, evt.data, agora);
    if (nome === 'messages.update' || nome === 'send.message.update') return normalizarStatus(instancia, evt.data);
    if (nome === 'connection.update') return normalizarConexao(instancia, evt.data);
    if (nome === 'contacts.upsert' || nome === 'contacts.update') return normalizarContatos(instancia, evt.data);
    return [];
  } catch {
    return [];
  }
}
