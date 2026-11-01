import { Global, Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { AuditService } from './audit.service';
import { PiiCryptoService } from './pii-crypto.service';
import { SettingsService } from './settings.service';

/** audit_log encadeado, cifragem de PII em repouso e settings globais. Global. */
@Global()
@Module({
  imports: [RealtimeModule],
  providers: [AuditService, PiiCryptoService, SettingsService],
  exports: [AuditService, PiiCryptoService, SettingsService],
})
export class SecurityModule {}
