import { describe, expect, it } from 'vitest';
import { preClassificar } from './preclassificador';

describe('preClassificar', () => {
  it.each([
    'assaltaram a loja agora',
    'roubaram meu celular',
    'sofri um acidente, preciso de ajuda',
    'é uma emergência',
    'socorro',
  ])('emergência: %s', (t) => expect(preClassificar(t).emergencia).toBe(true));
  it.each(['quanto custa o plano?', 'tenho medo de ser assaltado'])('não emergência: %s', (t) =>
    expect(preClassificar(t).emergencia).toBe(false),
  );
  it.each(['por favor parem de me mandar mensagem', 'não quero mais receber', 'sair da lista', 'descadastrar'])(
    'interrupção: %s',
    (t) => expect(preClassificar(t).interrupcao).toBe(true),
  );
  it('mensagem comum não dispara nada', () =>
    expect(preClassificar('quero um orçamento')).toEqual({ emergencia: false, interrupcao: false }));
});
