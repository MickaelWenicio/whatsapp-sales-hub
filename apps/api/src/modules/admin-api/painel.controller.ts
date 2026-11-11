import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotImplementedException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ETAPAS } from '@sales-hub/shared';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { NumerosService } from '../channel/numeros.service';
import { ControleService } from '../controle/controle.service';
import { FunilService } from '../crm/funil.service';
import { OutboundService } from '../outbound/outbound.service';
import { SettingsService } from '../security/settings.service';
import { Actor, ActorGuard, type ActorPainel, Roles, RolesGuard } from './rbac';
import { PainelService, validar } from './painel.service';

@Controller('admin')
@UseGuards(ActorGuard, RolesGuard)
export class PainelController {
  constructor(
    private readonly painel: PainelService,
    private readonly controle: ControleService,
    private readonly saida: OutboundService,
    private readonly settings: SettingsService,
    private readonly numeros: NumerosService,
    private readonly funil: FunilService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('conversas') listar(@Query() query: Record<string, string>, @Actor() actor: ActorPainel) {
    return this.painel.listar(query, actor.id);
  }
  @Post('conversas') novaConversa(@Body() body: unknown, @Actor() actor: ActorPainel) {
    return this.painel.novaConversa(body, actor.id);
  }
  @Get('conversas/:id') detalhe(@Param('id') id: string) {
    return this.painel.detalhe(id);
  }
  @Get('conversas/:id/mensagens') mensagens(
    @Param('id') id: string,
    @Query() query: Record<string, string>,
  ) {
    return this.painel.mensagens(id, query);
  }
  @Get('conversas/:id/trilha') trilha(@Param('id') id: string) {
    return this.painel.trilha(id);
  }
  @Post('conversas/:id/mensagens') enviar(
    @Param('id') id: string,
    @Body() body: unknown,
    @Actor() actor: ActorPainel,
  ) {
    return this.painel.enviar(id, actor.id, body);
  }
  @Post('conversas/:id/notas') nota(
    @Param('id') id: string,
    @Body() body: unknown,
    @Actor() actor: ActorPainel,
  ) {
    return this.painel.nota(id, actor.id, body);
  }
  @Post('conversas/:id/ler') @HttpCode(204) ler(@Param('id') id: string) {
    return this.painel.ler(id);
  }
  @Post('conversas/:id/assumir') @HttpCode(204) assumir(
    @Param('id') id: string,
    @Actor() actor: ActorPainel,
  ) {
    return this.controle.assumir(id, actor.id);
  }
  @Post('conversas/:id/pausar') @HttpCode(204) pausar(
    @Param('id') id: string,
    @Actor() actor: ActorPainel,
  ) {
    return this.controle.pausar(id, actor.id);
  }
  @Post('conversas/:id/devolver') @HttpCode(204) devolver(
    @Param('id') id: string,
    @Actor() actor: ActorPainel,
  ) {
    return this.controle.devolver(id, actor.id);
  }
  @Post('conversas/:id/encerrar') @HttpCode(204) encerrar(
    @Param('id') id: string,
    @Body() body: unknown,
    @Actor() actor: ActorPainel,
  ) {
    const dto = validar(z.object({ motivo: z.string().trim().max(1000).optional() }), body ?? {});
    return this.controle.encerrar(id, actor.id, dto.motivo);
  }
  @Post('conversas/:id/transferir') @HttpCode(204) transferir(
    @Param('id') id: string,
    @Body() body: unknown,
    @Actor() actor: ActorPainel,
  ) {
    const dto = validar(
      z.object({
        setorId: z.string().min(1).optional(),
        usuarioId: z.string().min(1).optional(),
        nota: z.string().trim().max(4096).optional(),
      }),
      body,
    );
    return this.controle.transferir(id, actor.id, dto, dto.nota);
  }
  @Post('conversas/:id/resumo') @HttpCode(202) resumo() {
    throw new NotImplementedException(
      'Resumo por IA indisponível neste protótipo. Os resumos da demonstração continuam disponíveis.',
    );
  }
  @Post('mensagens/:id/reenviar') @HttpCode(204) reenviar(@Param('id') id: string) {
    return this.saida.reenviar(id);
  }
  @Get('oportunidades') oportunidades(@Query() query: Record<string, string>) {
    return this.painel.oportunidades(query);
  }
  @Post('oportunidades/:id/mover') mover(
    @Param('id') id: string,
    @Body() body: unknown,
    @Actor() actor: ActorPainel,
  ) {
    const dto = validar(
      z.object({
        para: z.enum(ETAPAS),
        motivoPerda: z.string().trim().max(1000).optional(),
        evidencia: z
          .object({
            tipo: z.enum(['contrato_assinado', 'pagamento_confirmado', 'confirmacao_sistema']),
            observacao: z.string().trim().min(1).max(2000),
          })
          .optional(),
      }),
      body,
    );
    return this.funil.mover({ opportunityId: id, ...dto, ator: 'humano', atorUsuarioId: actor.id });
  }
  @Get('visao-geral') visaoGeral(@Query('periodo') periodo?: string) {
    return this.painel.visaoGeral(periodo);
  }
  @Get('ia-global') async iaGlobal() {
    return { ativa: await this.settings.iaGlobalAtiva() };
  }
  @Post('ia-global') @Roles('dono', 'gestor') @HttpCode(200) async definirIaGlobal(
    @Body() body: unknown,
    @Actor() actor: ActorPainel,
  ) {
    const dto = validar(z.object({ ativa: z.boolean() }), body);
    await this.controle.definirIaGlobal(dto.ativa, actor.id);
    return dto;
  }
  @Get('numeros') listarNumeros() {
    return this.numeros.listar();
  }
  @Get('numeros/:id/qr') @Roles('dono', 'gestor') qr(@Param('id') id: string) {
    return this.painel.qr(id);
  }
  @Post('numeros/:id/reiniciar') @Roles('dono', 'gestor') @HttpCode(204) reiniciarNumero(
    @Param('id') id: string,
  ) {
    return this.painel.acaoNumero(id, 'reiniciar');
  }
  @Post('numeros/:id/desconectar') @Roles('dono', 'gestor') @HttpCode(204) desconectarNumero(
    @Param('id') id: string,
  ) {
    return this.painel.acaoNumero(id, 'desconectar');
  }
  @Get('demo/numeros-permitidos') @Roles('dono') async permitidos() {
    return { numeros: await this.settings.numerosPermitidos() };
  }
  @Put('demo/numeros-permitidos') @Roles('dono') definirPermitidos(
    @Body() body: unknown,
    @Actor() actor: ActorPainel,
  ) {
    return this.painel.definirPermitidos(body, actor.id);
  }
  @Post('demo/simulador') @Roles('dono') simular(@Body() body: unknown) {
    return this.painel.simular(body);
  }
  @Post('demo/reiniciar') @Roles('dono') reiniciarDemo() {
    throw new ConflictException(
      'A reinicialização da demonstração está desativada neste protótipo para preservar os dados existentes.',
    );
  }
  @Get('equipe') async equipe() {
    const [usuarios, setores] = await Promise.all([
      this.prisma.user.findMany({
        where: { ativo: true },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      }),
      this.prisma.sector.findMany({ select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    ]);
    return { usuarios, setores };
  }
}
