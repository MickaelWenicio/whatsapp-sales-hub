import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ActorGuard, Roles, RolesGuard } from './rbac';
import { RecuperacaoService } from './recuperacao.service';

@Controller('admin/recuperacao')
@UseGuards(ActorGuard, RolesGuard)
@Roles('dono', 'gestor')
export class RecuperacaoController {
  constructor(private readonly service: RecuperacaoService) {}

  @Post('variacoes') @HttpCode(200) variacoes(@Body() body: unknown) {
    return this.service.gerarVariacoes(body);
  }
}
