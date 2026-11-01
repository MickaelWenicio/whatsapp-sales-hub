import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EventosService } from '../realtime/eventos.service';
import { AuditService } from './audit.service';

export type ChaveSetting = 'iaGlobalAtiva' | 'demoNumerosPermitidos';

/** Configurações globais editáveis pelo painel (system_settings). */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly eventos: EventosService,
    private readonly config: ConfigService,
  ) {}

  /** IA global ligada? Padrão: ligada quando a chave nunca foi gravada. */
  async iaGlobalAtiva(): Promise<boolean> {
    const s = await this.prisma.systemSetting.findUnique({ where: { chave: 'iaGlobalAtiva' } });
    return typeof s?.valor === 'boolean' ? s.valor : true;
  }

  /** Números E.164 permitidos na demo: setting do banco; se ausente, DEMO_ALLOWED_NUMBERS. */
  async numerosPermitidos(): Promise<string[]> {
    const s = await this.prisma.systemSetting.findUnique({ where: { chave: 'demoNumerosPermitidos' } });
    if (Array.isArray(s?.valor)) return s.valor.filter((v): v is string => typeof v === 'string');
    return (this.config.get<string>('DEMO_ALLOWED_NUMBERS') ?? '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
  }

  async definir(chave: ChaveSetting, valor: unknown, atorId: string): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { chave },
      create: { chave, valor: valor as never, atualizadoPor: atorId },
      update: { valor: valor as never, atualizadoPor: atorId },
    });
    await this.audit.registrar({
      ator: `usuario_painel:${atorId}`,
      acao: 'definir_setting',
      entidade: 'system_setting',
      entidadeId: chave,
    });
    await this.eventos.publicar('settings.updated', { chave });
  }
}
