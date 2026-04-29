import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { LedgerService } from './services/ledger.service';
import { LedgerVerificationService } from './services/ledger-verification.service';
import { LedgerController } from './controllers/ledger.controller';
import { User } from '../users/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([LedgerEntry, User]), NotificationsModule],
  controllers: [LedgerController],
  providers: [LedgerService, LedgerVerificationService],
  exports: [LedgerService, LedgerVerificationService],
})
export class LedgerModule {}