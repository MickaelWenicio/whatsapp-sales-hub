import { Module } from '@nestjs/common';
import { RateLimitGuard } from '../../common/rate-limit.guard';
import { AuthController, AuthService } from './auth.controller';
import { ActorGuard, RolesGuard } from './rbac';

/**
 * API do painel. Exporta os guards para os controllers de outros módulos
 * (`@UseGuards(ActorGuard, RolesGuard)`); novos controllers entram em `controllers`.
 */
@Module({
  controllers: [AuthController],
  providers: [ActorGuard, RolesGuard, RateLimitGuard, AuthService],
  exports: [ActorGuard, RolesGuard],
})
export class AdminApiModule {}
