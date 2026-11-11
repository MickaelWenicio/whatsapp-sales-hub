import { Module } from '@nestjs/common';
import { ChannelModule } from '../channel/channel.module';
import { ControleModule } from '../controle/controle.module';
import { CrmModule } from '../crm/crm.module';
import { OutboundModule } from '../outbound/outbound.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AdminApiModule } from './admin-api.module';
import { NumeroOperacaoController } from './numero-operacao.controller';
import { NumeroOperacaoService } from './numero-operacao.service';
import { RecuperacaoController } from './recuperacao.controller';
import { RecuperacaoService } from './recuperacao.service';
import { CatalogoController } from './catalogo.controller';
import { CatalogoService } from './catalogo.service';
import { PainelController } from './painel.controller';
import { PainelService } from './painel.service';

/** Separate from auth to avoid a cycle through the realtime publishers. */
@Module({
  imports: [
    AdminApiModule,
    ChannelModule,
    ControleModule,
    CrmModule,
    OutboundModule,
    RealtimeModule,
  ],
  controllers: [PainelController, NumeroOperacaoController, CatalogoController, RecuperacaoController],
  providers: [PainelService, NumeroOperacaoService, CatalogoService, RecuperacaoService],
})
export class PainelApiModule {}
