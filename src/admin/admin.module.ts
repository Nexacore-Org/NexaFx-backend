import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Transaction]),
    AuditLogsModule,
    ReportsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
