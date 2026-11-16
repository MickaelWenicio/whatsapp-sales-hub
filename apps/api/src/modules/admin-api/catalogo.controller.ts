import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Actor, ActorGuard, type ActorPainel, Roles, RolesGuard } from './rbac';
import { CatalogoService } from './catalogo.service';

/**
 * Catálogo editável (Product, PriceRule, Faq). O agente lê os itens aprovados a cada turno.
 * Remoção também via POST .../remover porque o BFF só repassa GET, POST e PUT.
 */
@Controller('admin/catalogo')
@UseGuards(ActorGuard, RolesGuard)
@Roles('dono', 'gestor')
export class CatalogoController {
  constructor(private readonly svc: CatalogoService) {}

  @Get() listar() {
    return this.svc.listar();
  }

  @Post('produtos') criarProduto(@Body() b: unknown, @Actor() a: ActorPainel) {
    return this.svc.criarProduto(b, a.id);
  }
  @Put('produtos/:id') atualizarProduto(@Param('id') id: string, @Body() b: unknown, @Actor() a: ActorPainel) {
    return this.svc.atualizarProduto(id, b, a.id);
  }
  @Delete('produtos/:id') @HttpCode(204) removerProduto(@Param('id') id: string, @Actor() a: ActorPainel) {
    return this.svc.removerProduto(id, a.id);
  }
  @Post('produtos/:id/remover') @HttpCode(204) removerProdutoPost(@Param('id') id: string, @Actor() a: ActorPainel) {
    return this.svc.removerProduto(id, a.id);
  }

  @Post('precos') criarPreco(@Body() b: unknown, @Actor() a: ActorPainel) {
    return this.svc.criarPreco(b, a.id);
  }
  @Put('precos/:id') atualizarPreco(@Param('id') id: string, @Body() b: unknown, @Actor() a: ActorPainel) {
    return this.svc.atualizarPreco(id, b, a.id);
  }
  @Delete('precos/:id') @HttpCode(204) removerPreco(@Param('id') id: string, @Actor() a: ActorPainel) {
    return this.svc.removerPreco(id, a.id);
  }
  @Post('precos/:id/remover') @HttpCode(204) removerPrecoPost(@Param('id') id: string, @Actor() a: ActorPainel) {
    return this.svc.removerPreco(id, a.id);
  }

  @Post('faqs') criarFaq(@Body() b: unknown, @Actor() a: ActorPainel) {
    return this.svc.criarFaq(b, a.id);
  }
  @Put('faqs/:id') atualizarFaq(@Param('id') id: string, @Body() b: unknown, @Actor() a: ActorPainel) {
    return this.svc.atualizarFaq(id, b, a.id);
  }
  @Delete('faqs/:id') @HttpCode(204) removerFaq(@Param('id') id: string, @Actor() a: ActorPainel) {
    return this.svc.removerFaq(id, a.id);
  }
  @Post('faqs/:id/remover') @HttpCode(204) removerFaqPost(@Param('id') id: string, @Actor() a: ActorPainel) {
    return this.svc.removerFaq(id, a.id);
  }
}
