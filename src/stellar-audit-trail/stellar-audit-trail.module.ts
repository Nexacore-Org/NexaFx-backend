import { Module } from '@nestjs/common';
import { StellarAuditTrailController } from './stellar-audit-trail.controller';
import { StellarAuditTrailService } from './stellar-audit-trail.service';

@Module({
  controllers: [StellarAuditTrailController],
  providers: [StellarAuditTrailService],
  exports: [StellarAuditTrailService],
})
export class StellarAuditTrailModule {}
