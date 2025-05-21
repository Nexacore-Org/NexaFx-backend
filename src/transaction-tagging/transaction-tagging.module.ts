import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { AuthModule } from '../auth/auth.module';
import { TransactionTag } from './entities/transaction-tagging.entity';
import { TransactionTagsController } from './transaction-tagging.controller';
import { TransactionTagsService } from './transaction-tagging.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionTag, Transaction]),
    AuthModule,
  ],
  controllers: [TransactionTagsController],
  providers: [TransactionTagsService],
  exports: [TransactionTagsService],
})
export class TransactionTagsModule {}
