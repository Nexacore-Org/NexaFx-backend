import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { SupportTicket } from './entities/support-ticket.entity';
import { User } from '../users/user.entity';
import { AuditLog } from '../audit-logs/entities/audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      Notification,
      SupportTicket,
      User,
      AuditLog,
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
