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
import { MigrationSnapshot } from '../database/entities/migration-snapshot.entity';
import { ImpersonationController } from './impersonation/impersonation.controller';
import { ImpersonationService } from './impersonation/impersonation.service';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Transaction, DataRequest, KycRecord, RateAlert, AuditLog, MigrationSnapshot]),
    AuditLogsModule,
    ReportsModule,
    TransactionLimitsModule,
    KycModule,
    JwtModule,
    UsersModule,
  ],
  controllers: [AdminController, ImpersonationController],
  providers: [AdminService, BackupManifestService, ImpersonationService],
  exports: [ImpersonationService],
})
export class AdminModule {}