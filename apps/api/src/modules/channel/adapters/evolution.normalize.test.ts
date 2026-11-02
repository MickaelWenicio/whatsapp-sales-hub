import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizarEvento } from './evolution.normalize';

const TS = 1_700_000_000; // 2023-11-14T22:13:20.000Z
const agora = new Date((TS + 40) * 1000);

function fixture(nome: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, '../../../../test/fixtures/evolution', `${nome}.json`), 'utf8'));
}

function upsert(data: Record<string, unknown>, instance = 'sales-hub') {
  return {
    event: 'messages.upsert',
    instance,
    data: {
      key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false, id: 'ABC123' },
      message: { conversation: 'oi' },
      messageType: 'conversation',
      messageTimestamp: TS,
      ...data,
    },
  };
}

describe('normalizarEvento: mensagem', () => {
  it('normaliza uma mensagem de texto recebida', () => {
    const [m] = normalizarEvento(upsert({}), agora);
    expect(m).toEqual({
      tipo: 'mensagem',
      instancia: 'sales-hub',
      de: '+5511999998888',
      idExterno: 'ABC123',
      fromMe: false,
      tipoMensagem: 'texto',
      texto: 'oi',
      timestamp: new Date(TS * 1000).toISOString(),
    });
  });

  it('captura fromMe sem pushName e ignora grupos', () => {
    const [m] = normalizarEvento(
      upsert({ key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: true, id: 'X' }, pushName: 'Minha Conta' }),
      agora,
    );
    expect(m).toMatchObject({ tipo: 'mensagem', fromMe: true });
    expect((m as { pushName?: string }).pushName).toBeUndefined();
    expect(normalizarEvento(upsert({ key: { remoteJid: '123-456@g.us', fromMe: false, id: 'Y' } }), agora)).toEqual([]);
  });

  it('extrai legenda de imagem e tipo', () => {
    const [m] = normalizarEvento(
      upsert({ message: { imageMessage: { caption: 'segue o doc' } }, messageType: 'imageMessage' }),
      agora,
    );
    expect(m).toMatchObject({ tipoMensagem: 'imagem', texto: 'segue o doc' });
  });

  it('captura e apara pushName; vazio some', () => {
    expect(normalizarEvento(upsert({ pushName: '  João  ' }), agora)[0]).toMatchObject({ pushName: 'João' });
    expect((normalizarEvento(upsert({ pushName: '   ' }), agora)[0] as { pushName?: string }).pushName).toBeUndefined();
  });

  it('aceita remoteJid @lid usando key.remoteJidAlt @s.whatsapp.net', () => {
    const [m] = normalizarEvento(
      upsert({ key: { remoteJid: '123@lid', remoteJidAlt: '5511900000099@s.whatsapp.net', id: 'A1', fromMe: false } }),
      agora,
    );
    expect(m).toMatchObject({ tipo: 'mensagem', de: '+5511900000099', idExterno: 'A1' });
  });

  it('descarta @lid sem alternativa, @g.us e status@broadcast', () => {
    expect(normalizarEvento(upsert({ key: { remoteJid: '123@lid', id: 'A2', fromMe: false } }), agora)).toEqual([]);
    expect(normalizarEvento(upsert({ key: { remoteJid: '1-2@g.us', id: 'A3', fromMe: false } }), agora)).toEqual([]);
    expect(normalizarEvento(upsert({ key: { remoteJid: 'status@broadcast', id: 'A4', fromMe: false } }), agora)).toEqual([]);
  });

  it('descarta mensagem com messageTimestamp mais de 10 min antes de agora (histórico importado)', () => {
    const velho = new Date((TS + 11 * 60) * 1000);
    const recente = new Date((TS + 9 * 60) * 1000);
    expect(normalizarEvento(upsert({}), velho)).toEqual([]);
    expect(normalizarEvento(upsert({}), recente)).toHaveLength(1);
  });

  it('figurinha → tipoMensagem figurinha; reactionMessage → evento reacao (não mensagem)', () => {
    const [f] = normalizarEvento(upsert({ message: { stickerMessage: {} }, messageType: 'stickerMessage' }), agora);
    expect(f).toMatchObject({ tipo: 'mensagem', tipoMensagem: 'figurinha' });
    const r = normalizarEvento(
      upsert({
        message: { reactionMessage: { key: { id: 'ALVO1' }, text: '❤️' } },
        messageType: 'reactionMessage',
      }),
      agora,
    );
    expect(r).toEqual([{ tipo: 'reacao', instancia: 'sales-hub', idExterno: 'ABC123', alvoIdExterno: 'ALVO1', emoji: '❤️' }]);
  });

  it('áudio, vídeo e documento mapeiam o tipo', () => {
    const tipo = (messageType: string) =>
      (normalizarEvento(upsert({ message: {}, messageType }), agora)[0] as { tipoMensagem: string }).tipoMensagem;
    expect(tipo('audioMessage')).toBe('audio');
    expect(tipo('videoMessage')).toBe('video');
    expect(tipo('documentMessage')).toBe('documento');
    expect(tipo('documentWithCaptionMessage')).toBe('documento');
  });

  it('payload sem data, nulo ou lixo devolve vazio', () => {
    expect(normalizarEvento({}, agora)).toEqual([]);
    expect(normalizarEvento(null, agora)).toEqual([]);
    expect(normalizarEvento('x', agora)).toEqual([]);
  });
});

describe('normalizarEvento: conexão, status e contato', () => {
  const conn = (state: string) => ({ event: 'connection.update', instance: 'sales-hub', data: { state } });

  it('connection.update open → conectado; close → desconectado; connecting → reconectando', () => {
    expect(normalizarEvento(conn('open'), agora)).toEqual([{ tipo: 'conexao', instancia: 'sales-hub', estado: 'conectado' }]);
    expect(normalizarEvento(conn('close'), agora)[0]).toMatchObject({ estado: 'desconectado' });
    expect(normalizarEvento(conn('connecting'), agora)[0]).toMatchObject({ estado: 'reconectando' });
    expect(normalizarEvento(conn('qualquer'), agora)).toEqual([]);
  });

  it('aceita nome de evento em MAIÚSCULAS com underscore', () => {
    expect(normalizarEvento({ event: 'CONNECTION_UPDATE', instance: 'g', data: { state: 'open' } }, agora)).toHaveLength(1);
  });

  it('messages.update com status DELIVERY_ACK → entregue; READ → lida; SERVER_ACK → enviada', () => {
    const st = (status: string) =>
      normalizarEvento({ event: 'messages.update', instance: 'g', data: { keyId: 'K1', status } }, agora);
    expect(st('DELIVERY_ACK')).toEqual([{ tipo: 'status', instancia: 'g', idExterno: 'K1', status: 'entregue' }]);
    expect(st('READ')[0]).toMatchObject({ status: 'lida' });
    expect(st('PLAYED')[0]).toMatchObject({ status: 'lida' });
    expect(st('SERVER_ACK')[0]).toMatchObject({ status: 'enviada' });
    expect(st('PENDING')).toEqual([]);
  });

  it('messages.update aceita formato aninhado key.id + update.status', () => {
    expect(
      normalizarEvento(
        { event: 'messages.update', instance: 'g', data: [{ key: { id: 'Z9' }, update: { status: 'READ' } }] },
        agora,
      ),
    ).toEqual([{ tipo: 'status', instancia: 'g', idExterno: 'Z9', status: 'lida' }]);
  });

  it('contacts.update gera evento contato', () => {
    expect(
      normalizarEvento(
        {
          event: 'contacts.update',
          instance: 'g',
          data: [{ remoteJid: '5511999998888@s.whatsapp.net', pushName: 'João' }, { id: '1-2@g.us' }],
        },
        agora,
      ),
    ).toEqual([{ tipo: 'contato', instancia: 'g', de: '+5511999998888', pushName: 'João' }]);
  });
});

describe('fixtures Evolution v2', () => {
  it('texto', () => {
    expect(normalizarEvento(fixture('texto'), agora)).toEqual([
      {
        tipo: 'mensagem',
        instancia: 'sales-hub',
        de: '+5500900000001',
        idExterno: '3EB0A1B2C3D4E5F60001',
        fromMe: false,
        tipoMensagem: 'texto',
        texto: 'oi, quero cotar o plano completo pra minha empresa',
        pushName: 'Cliente Teste',
        timestamp: '2023-11-14T22:13:20.000Z',
      },
    ]);
  });

  it('audio', () => {
    expect(normalizarEvento(fixture('audio'), agora)[0]).toMatchObject({
      tipo: 'mensagem',
      tipoMensagem: 'audio',
      idExterno: '3EB0A1B2C3D4E5F60002',
      de: '+5500900000001',
    });
  });

  it('figurinha', () => {
    expect(normalizarEvento(fixture('figurinha'), agora)[0]).toMatchObject({
      tipoMensagem: 'figurinha',
      idExterno: '3EB0A1B2C3D4E5F60003',
    });
  });

  it('reacao', () => {
    expect(normalizarEvento(fixture('reacao'), agora)).toEqual([
      {
        tipo: 'reacao',
        instancia: 'sales-hub',
        idExterno: '3EB0A1B2C3D4E5F60004',
        alvoIdExterno: '3EB0A1B2C3D4E5F60099',
        emoji: '👍',
      },
    ]);
  });

  it('status', () => {
    expect(normalizarEvento(fixture('status'), agora)).toEqual([
      { tipo: 'status', instancia: 'sales-hub', idExterno: '3EB0A1B2C3D4E5F60099', status: 'lida' },
    ]);
  });

  it('conexao', () => {
    expect(normalizarEvento(fixture('conexao'), agora)).toEqual([
      { tipo: 'conexao', instancia: 'sales-hub', estado: 'conectado' },
    ]);
  });
});
