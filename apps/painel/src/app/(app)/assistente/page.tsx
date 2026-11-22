import { auth } from '@/auth';
import { Assistente } from '@/components/assistente/Assistente';
import { primeiroNome } from '@/lib/formatos';

/** "Bom dia", "Boa tarde" ou "Boa noite" pelo horário de Brasília. */
function saudacaoAgora(): string {
  const hora = Number(
    new Intl.DateTimeFormat('pt-BR', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date()),
  );
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default async function Pagina() {
  // Mesma sessão que o layout usa para o menu do usuário.
  const sessao = await auth();
  return <Assistente primeiroNome={primeiroNome(sessao?.user?.name)} saudacao={saudacaoAgora()} />;
}
