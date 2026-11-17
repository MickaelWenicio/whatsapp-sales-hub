import { Body, Controller, Delete, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { NumeroOperacaoService } from './numero-operacao.service';
import { Actor, ActorGuard, type ActorPainel, Roles, RolesGuard } from './rbac';

@Controller('admin/numero-operacao')
@UseGuards(ActorGuard, RolesGuard)
@Roles('dono', 'gestor')
export class NumeroOperacaoController {
  constructor(private readonly service: NumeroOperacaoService) {}

  @Post() criar(@Body() body: unknown, @Actor() actor: ActorPainel) {
    return this.service.criar(body, actor.id);
  }
  @Put(':id') renomear(
    @Param('id') id: string,
    @Body() body: unknown,
    @Actor() actor: ActorPainel,
  ) {
    return this.service.renomear(id, body, actor.id);
  }
  @Delete(':id') @HttpCode(204) remover(@Param('id') id: string, @Actor() actor: ActorPainel) {
    return this.service.remover(id, actor.id);
  }
  /** O BFF só repassa GET, POST e PUT; o painel usa esta rota. */
  @Post(':id/remover') @HttpCode(204) removerPost(
    @Param('id') id: string,
    @Actor() actor: ActorPainel,
  ) {
    return this.service.remover(id, actor.id);
  }
}
