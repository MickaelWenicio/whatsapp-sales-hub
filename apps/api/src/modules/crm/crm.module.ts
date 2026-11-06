import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { FunilService } from './funil.service';

/** CRM: funil de vendas. Exporta FunilService para o agente (Task 10b) e a API do painel (Task 11). */
@Module({
  imports: [RealtimeModule],
  providers: [FunilService],
  exports: [FunilService],
})
export class CrmModule {}
