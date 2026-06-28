import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dispute } from './entities/dispute.entity';
import { DisputeEvidence } from './entities/dispute-evidence.entity';
import { DisputesService } from './disputes.service';
import { DisputesController } from './controllers/disputes.controller';
import { DisputeAdminController } from './controllers/dispute-admin.controller';
import { Transaction } from '../transactions/entities/transaction.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { LedgerModule } from '../ledger/ledger.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Dispute, DisputeEvidence, Transaction]),
    NotificationsModule,
    LedgerModule,
    UsersModule,
  ],
  controllers: [DisputesController, DisputeAdminController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
