import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Statement } from './entities/statement.entity';
import { StatementService } from './statement.service';
import { StatementsController } from './statements.controller';
import { StatementCronService } from './statement-cron.service';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { WalletsModule } from '../../wallets/wallets.module';
import { UsersModule } from '../../users/users.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Statement, Transaction]),
    WalletsModule,
    UsersModule,
    NotificationsModule,
  ],
  controllers: [StatementsController],
  providers: [StatementService, StatementCronService],
  exports: [StatementService],
})
export class StatementsModule {}
