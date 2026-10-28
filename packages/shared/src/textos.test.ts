import { expect, it } from 'vitest';
import { TEXTO_CONTINGENCIA, TEXTO_EMERGENCIA, TEXTO_INTERRUPCAO } from './textos';

it('textos fixos exatos', () => {
  expect(TEXTO_EMERGENCIA).toBe(
    'Entendi. Vou te passar agora para a pessoa da nossa equipe, que vai te orientar. Se houver risco, ligue 190.',
  );
  expect(TEXTO_INTERRUPCAO).toBe('Pronto, não vamos mais te enviar mensagens. Se precisar, é só chamar.');
  expect(TEXTO_CONTINGENCIA).toBe('Já te respondo, só um instante.');
});
