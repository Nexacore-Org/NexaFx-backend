import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../audit-logs/entities/audit-log.entity';
import { KycRecord } from '../kyc/entities/kyc.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { User } from '../users/user.entity';
import { EvidencePackageController } from './controllers/evidence-package.controller';
import { EvidencePackage } from './entities/evidence-package.entity';
import { EvidencePackageService } from './services/evidence-package.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EvidencePackage,
      User,
      Transaction,
      Notification,
      AuditLog,
      KycRecord,
    ]),
  ],
  controllers: [EvidencePackageController],
  providers: [EvidencePackageService],
  exports: [EvidencePackageService],
})
export class ComplianceEvidenceModule {}
