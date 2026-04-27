import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { StellarModule } from '../blockchain/stellar/stellar.module';
import { Currency } from '../currencies/currency.entity';
import { FeeConfig } from '../fees/entities/fee-config.entity';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { PlatformConfig } from './entities/platform-config.entity';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Currency, FeeConfig, PlatformConfig]),
    UsersModule,
    StellarModule,
    AuditLogsModule,
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
})
export class SuperAdminModule {}
