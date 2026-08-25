import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsModule } from '../../audit-logs/audit-logs.module';
import { Sar } from '../compliance/entities/sar.entity';
import { ComplianceFlag } from '../compliance/entities/compliance-flag.entity';
import { User } from '../../users/user.entity';
import { KycRecord } from '../../kyc/entities/kyc.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { FinancialCrimeReport } from './entities/financial-crime-report.entity';
import { GoAmlReportService } from './goaml-report.service';
import { FinancialCrimeReportService } from './financial-crime-report.service';
import { FinancialCrimeReportsController } from './financial-crime-reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FinancialCrimeReport,
      Sar,
      ComplianceFlag,
      User,
      KycRecord,
      Transaction,
    ]),
    AuditLogsModule,
  ],
  providers: [GoAmlReportService, FinancialCrimeReportService],
  controllers: [FinancialCrimeReportsController],
  exports: [GoAmlReportService, FinancialCrimeReportService],
})
export class FinancialCrimeReportsModule {}
