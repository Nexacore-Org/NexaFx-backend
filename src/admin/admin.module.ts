import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { User } from 'src/user/entities/user.entity';
import { Currency } from '../currencies/entities/currency.entity';
import { Wallet } from '../wallet/entities/wallet.entity'; // ✅ Import the Wallet entity
import { AuthModule } from '../auth/auth.module';
import { AdminStatsController } from './admin.stats.controller';
import { AdminStatsService } from './admin.stats.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, User, Currency, Wallet]), // ✅ Add Wallet here
    AuthModule,
    AuditModule,
  ],
  controllers: [AdminStatsController, AdminController],
  providers: [AdminStatsService, AdminService],
})
export class AdminModule {}
