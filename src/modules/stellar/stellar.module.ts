import { Global, Module } from '@nestjs/common';
import { AuditLogsModule } from '../../audit-logs/audit-logs.module';
import { StellarService } from './stellar.service';

@Global()
@Module({
  imports: [AuditLogsModule],
  providers: [StellarService],
  exports: [StellarService],
})
export class StellarModule {}
