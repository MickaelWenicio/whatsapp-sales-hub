import { describe, expect, it } from 'vitest';
import { filtrarBolha, lerTermosProibidos } from './filtro-saida';

describe('filtrarBolha', () => {
  it('valores e descontos', () => {
    expect(filtrarBolha('O plano básico sai a partir de R$ 69,90/mês.', [6990])).toEqual({ ok: true });
    expect(filtrarBolha('O plano completo fica R$ 129,90 por mês', [6990])).toEqual({ ok: false, motivo: 'valor_nao_aprovado' });
    expect(filtrarBolha('Consigo 15% de desconto pra você', [6990])).toEqual({ ok: false, motivo: 'desconto' });
    expect(filtrarBolha('Cupom de 10% na primeira mensalidade', [6990])).toEqual({ ok: false, motivo: 'desconto' });
    expect(filtrarBolha('Você acompanha tudo 100% pelo aplicativo', [6990])).toEqual({ ok: true });
    expect(filtrarBolha('Sai por R$ 1.299,00', [129900])).toEqual({ ok: true });
    expect(filtrarBolha('Sai por R$ 70', [7000])).toEqual({ ok: true });
  });

  it('termos proibidos configuráveis', () => {
    const termos = ['garantido', 'melhor do mercado'];
    expect(filtrarBolha('Resultado garantido em 7 dias', [], termos)).toEqual({ ok: false, motivo: 'termo_proibido', termo: 'garantido' });
    expect(filtrarBolha('Somos o MELHOR do mercado', [], termos)).toEqual({ ok: false, motivo: 'termo_proibido', termo: 'melhor do mercado' });
    // Ignora acentos e só casa a palavra inteira.
    expect(filtrarBolha('É grátis', [], ['gratis'])).toEqual({ ok: false, motivo: 'termo_proibido', termo: 'gratis' });
    expect(filtrarBolha('Garantidamente rápido', [], termos)).toEqual({ ok: true });
    // Sem lista, nada é bloqueado por termo.
    expect(filtrarBolha('Resultado garantido', [])).toEqual({ ok: true });
  });

  it('lerTermosProibidos separa por vírgula e ignora vazios', () => {
    expect(lerTermosProibidos(' garantido, ,melhor do mercado ')).toEqual(['garantido', 'melhor do mercado']);
    expect(lerTermosProibidos(undefined)).toEqual([]);
  });
});
