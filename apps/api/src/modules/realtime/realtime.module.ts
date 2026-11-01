import { Module } from '@nestjs/common';
import { AdminApiModule } from '../admin-api/admin-api.module';
import { EventosController } from './eventos.controller';
import { EventosService } from './eventos.service';

/** Eventos em tempo real (Redis pub/sub -> SSE). Exporta EventosService para publicar. */
@Module({
  imports: [AdminApiModule],
  controllers: [EventosController],
  providers: [EventosService],
  exports: [EventosService],
})
export class RealtimeModule {}
