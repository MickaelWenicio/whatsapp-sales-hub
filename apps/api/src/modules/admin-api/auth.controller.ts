import { BadRequestException, Body, Controller, HttpCode, Injectable, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { PapelUsuario } from '@prisma/client';
import { compareSync } from 'bcryptjs';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../security/audit.service';

export interface LoginDto {
  email: string;
  senha: string;
}

export interface OperadorAutenticado {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
}

/** Valida e-mail/senha (bcrypt) contra `users.senhaHash`. Mesma resposta para qualquer falha. */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto): Promise<OperadorAutenticado> {
    const email = dto?.email?.trim().toLowerCase();
    const senha = dto?.senha ?? '';
    if (!email || !senha) throw new BadRequestException('email e senha são obrigatórios.');

    const u = await this.prisma.user.findUnique({ where: { email } });
    if (!u || !u.ativo || !u.senhaHash || !compareSync(senha, u.senhaHash)) {
      throw new UnauthorizedException('credenciais inválidas');
    }
    await this.audit.registrar({
      ator: `usuario_painel:${u.id}`,
      acao: 'login',
      entidade: 'user',
      entidadeId: u.id,
    });
    return { id: u.id, nome: u.nome, email: u.email, papel: u.papel };
  }
}

/** Login do painel. Rota pública (sem ActorGuard), com rate limit anti brute-force. */
@Controller('admin/auth')
@UseGuards(RateLimitGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @RateLimit(10, 60_000)
  @HttpCode(200)
  login(@Body() body: LoginDto): Promise<OperadorAutenticado> {
    return this.auth.login(body ?? ({} as LoginDto));
  }
}
