import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../../prisma/prisma.service';

/**
 * Linhas de teste com sufixo único por execução (número próprio, contatos +5500 aleatórios).
 * `limpar` apaga só o que foi criado aqui.
 */
export class FixturesAgente {
  readonly run = randomUUID().replace(/-/g, '').slice(0, 10);
  numeroId = '';
  readonly contatos: string[] = [];
  private seq = 0;

  constructor(private readonly prisma: PrismaService) {}

  async preparar(estadoNumero: 'conectado' | 'desconectado' = 'conectado'): Promise<void> {
    const numero = await this.prisma.whatsAppNumber.create({
      data: {
        rotulo: `T10b ${this.run}`,
        e164: this.novoE164(),
        instanciaEvolution: `t10b-${this.run}`,
        estado: estadoNumero,
        ficticio: true,
      },
    });
    this.numeroId = numero.id;
    for (const nome of ['Comercial', 'Suporte', 'Pós-venda']) {
      await this.prisma.sector.upsert({ where: { nome }, update: {}, create: { nome } });
    }
  }

  novoE164(): string {
    return `+5500${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  }

  /** Contato + conversa IA_ATIVA + (opcional) primeira mensagem do cliente. */
  async conversa(textoCliente: string | null = 'Oi, quanto custa o plano completo pra minha empresa?') {
    const contato = await this.prisma.contact.create({ data: { e164: this.novoE164(), nome: null } });
    this.contatos.push(contato.id);
    const conversa = await this.prisma.conversation.create({
      data: { contactId: contato.id, numeroId: this.numeroId, ultimaMensagemClienteEm: new Date(), janelaAteEm: new Date(Date.now() + 86_400_000) },
    });
    const mensagem = textoCliente ? await this.cliente(conversa.id, textoCliente) : null;
    return { contato, conversa, mensagem };
  }

  /** Mensagem do cliente com `criadaEm` estritamente crescente. */
  async cliente(conversationId: string, texto: string) {
    return this.mensagem(conversationId, { autor: 'cliente', texto });
  }

  async mensagem(
    conversationId: string,
    d: {
      autor: 'cliente' | 'ia' | 'atendente' | 'sistema';
      texto: string;
      tipo?: 'texto' | 'nota_interna' | 'evento';
      status?: 'pendente' | 'enviada' | 'cancelada' | null;
      autorUsuarioId?: string;
      versaoControle?: number;
    },
  ) {
    this.seq += 1;
    return this.prisma.message.create({
      data: {
        conversationId,
        numeroId: this.numeroId,
        autor: d.autor,
        tipo: d.tipo ?? 'texto',
        texto: d.texto,
        status: d.status === undefined ? (d.autor === 'cliente' ? null : 'enviada') : d.status,
        autorUsuarioId: d.autorUsuarioId,
        versaoControle: d.versaoControle,
        criadaEm: new Date(Date.now() + this.seq),
      },
    });
  }

  async limpar(): Promise<void> {
    if (!this.numeroId) return;
    const conversas = await this.prisma.conversation.findMany({ where: { numeroId: this.numeroId }, select: { id: true } });
    const ids = conversas.map((c) => c.id);
    await this.prisma.task.deleteMany({
      where: { OR: [{ conversationId: { in: ids } }, { opportunity: { contactId: { in: this.contatos } } }] },
    });
    await this.prisma.message.deleteMany({ where: { numeroId: this.numeroId } });
    await this.prisma.conversation.deleteMany({ where: { numeroId: this.numeroId } });
    await this.prisma.contact.deleteMany({ where: { id: { in: this.contatos } } });
    await this.prisma.whatsAppNumber.delete({ where: { id: this.numeroId } });
  }
}
