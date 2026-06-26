import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ReportsModule } from './reports/reports.module';
import { DataRequest } from '../users/entities/data-request.entity';
import { TransactionLimitsModule } from '../transactions/transaction-limits.module';
import { KycRecord } from '../kyc/entities/kyc.entity';
import { RateAlert } from '../rate-alerts/entities/rate-alert.entity';
import { AuditLog } from '../audit-logs/entities/audit-log.entity';
import { KycModule } from '../kyc/kyc.module';
import { BackupManifestService } from './services/backup-manifest.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Transaction, DataRequest, KycRecord, RateAlert, AuditLog]),
    AuditLogsModule,
    ReportsModule,
    TransactionLimitsModule,
    KycModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, BackupManifestService],
})
export class AdminModule { }
