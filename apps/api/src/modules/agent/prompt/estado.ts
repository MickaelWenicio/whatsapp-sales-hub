import { ROTULOS_ETAPA } from '@sales-hub/shared';
import type { PrismaService } from '../../../prisma/prisma.service';

const fmt = (d: Date, comData = true) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    ...(comData ? { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);

const ia = (campos: unknown, nome: string) =>
  campos && typeof campos === 'object' && nome in (campos as object) ? ' (preenchido pela IA)' : '';

/**
 * Estado do turno (spec §9.2 item 3), enviado como `{ role: 'system' }` no fim das mensagens.
 * Tudo o que muda por turno fica aqui, fora do bloco estável em cache.
 */
export async function montarEstado(
  prisma: PrismaService,
  conversationId: string,
  sinais: { emergencia: boolean; interrupcao: boolean },
  agora = new Date(),
): Promise<string> {
  const conv = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: {
      contact: { include: { consentimento: true, itens: { orderBy: { createdAt: 'asc' } } } },
      tarefas: { where: { status: 'aberta' }, include: { responsavel: { select: { nome: true } } } },
    },
  });
  const c = conv.contact;
  const op = await prisma.opportunity.findFirst({
    where: { contactId: c.id, fechadaEm: null },
    orderBy: { criadaEm: 'desc' },
    include: { objecoes: { orderBy: { criadaEm: 'asc' } }, tarefas: { where: { status: 'aberta' }, include: { responsavel: { select: { nome: true } } } } },
  });
  const desde = new Date(agora.getTime() - 7 * 86_400_000);
  const notas = await prisma.message.findMany({
    where: { conversationId, tipo: 'nota_interna', criadaEm: { gte: desde } },
    orderBy: { criadaEm: 'desc' },
    take: 5,
    include: { autorUsuario: { select: { nome: true } } },
  });
  const eventos = await prisma.message.findMany({
    where: { conversationId, tipo: 'evento', criadaEm: { gte: desde } },
    orderBy: { criadaEm: 'desc' },
    take: 6,
  });

  const L: string[] = [];
  L.push('Estado atual (montado pelo sistema a cada turno; não mostre ao cliente).');
  L.push(`Agora: ${fmt(agora)} (horário de Brasília).`);
  L.push(
    conv.janelaAteEm && conv.janelaAteEm > agora
      ? `Janela de 24 h do WhatsApp: aberta até ${fmt(conv.janelaAteEm)}.`
      : 'Janela de 24 h do WhatsApp: fechada.',
  );
  const camposIa = c.camposIa as Record<string, { valor?: string }>;
  L.push(
    `Contato: nome ${c.nome ?? 'não informado'}${ia(camposIa, 'nome')}; cidade ${c.cidade ?? 'não informada'}${ia(camposIa, 'cidade')}; UF ${c.uf ?? 'não informada'}${ia(camposIa, 'uf')}; melhor horário ${camposIa?.melhorHorario?.valor ?? 'não informado'}; situação ${c.statusCliente}.`,
  );
  L.push(
    c.consentimento?.status === 'revogado'
      ? `Permissão de contato: revogada em ${fmt(c.consentimento.em)} (o cliente pediu para não receber mensagens).`
      : 'Permissão de contato: sem restrição.',
  );
  if (c.itens.length) {
    L.push('Itens de interesse:');
    for (const it of c.itens) {
      const partes = [
        it.categoria ?? 'sem categoria',
        it.descricao,
        it.quantidade != null ? `quantidade ${it.quantidade}` : null,
      ].filter(Boolean);
      const marcados = ['categoria', 'descricao', 'quantidade'].filter((k) => ia(it.camposIa, k));
      L.push(`- itemId ${it.id}: ${partes.join(', ')}${marcados.length ? ` (${marcados.join(', ')} preenchidos pela IA)` : ''}`);
    }
  } else {
    L.push('Itens de interesse: nenhum registrado.');
  }
  if (op) {
    const partes = [
      `etapa ${ROTULOS_ETAPA[op.etapa]} desde ${fmt(op.etapaDesde)}`,
      op.produto ? `produto ${op.produto}` : null,
      op.solucaoAtual ? `solução atual ${op.solucaoAtual}` : null,
      op.momentoCompra ? `momento de compra ${op.momentoCompra}` : null,
      op.preocupacao ? `preocupação ${op.preocupacao}` : null,
      op.prazoDecisao ? `prazo de decisão ${op.prazoDecisao}` : null,
      op.proximaAcao ? `próxima ação ${op.proximaAcao}${op.proximaAcaoEm ? ` até ${fmt(op.proximaAcaoEm)}` : ''}` : null,
    ].filter(Boolean);
    L.push(`Oportunidade aberta: ${partes.join('; ')}.`);
    if (op.objecoes.length) L.push(`Objeções: ${op.objecoes.map((o) => `${o.tipo} ("${o.descricao}")`).join('; ')}.`);
  } else {
    L.push('Oportunidade aberta: nenhuma.');
  }
  const tarefas = [...(op?.tarefas ?? []), ...conv.tarefas.filter((t) => !op || t.opportunityId !== op.id)];
  L.push(
    tarefas.length
      ? `Tarefas abertas: ${tarefas.map((t) => `${t.tipo} "${t.titulo}"${t.responsavel ? ` com ${t.responsavel.nome}` : ''}${t.prazoEm ? ` até ${fmt(t.prazoEm)}` : ''}`).join('; ')}.`
      : 'Tarefas abertas: nenhuma.',
  );
  if (eventos.length) {
    L.push(`Eventos recentes: ${eventos.reverse().map((e) => `${fmt(e.criadaEm, false)} ${e.texto}`).join('; ')}.`);
  }
  if (notas.length) {
    L.push('Notas internas da equipe (só para você):');
    for (const n of notas.reverse()) L.push(`- ${n.autorUsuario?.nome ?? 'Sistema'}: ${n.texto}`);
  }
  if (sinais.emergencia) L.push('Aviso: possível emergência; siga o protocolo.');
  if (sinais.interrupcao) L.push('Aviso: possível pedido de interrupção; se o cliente quer parar de receber mensagens, chame registrar_interrupcao.');
  return L.join('\n');
}
