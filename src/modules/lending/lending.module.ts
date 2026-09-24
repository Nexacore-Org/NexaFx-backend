import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { LendingOffer } from './entities/lending-offer.entity';
import { LendingAgreement } from './entities/lending-agreement.entity';
import { LendingService } from './lending.service';
import { LendingController } from './lending.controller';
import { WalletsModule } from '../wallets/wallets.module';
import { UsersModule } from '../users/users.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LendingOffer, LendingAgreement]),
    ScheduleModule,
    WalletsModule,
    UsersModule,
    AuditLogsModule,
  ],
  controllers: [LendingController],
  providers: [LendingService],
  exports: [LendingService],
})
export class LendingModule {}
