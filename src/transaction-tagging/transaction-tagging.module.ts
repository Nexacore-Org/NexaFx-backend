import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionTagsService } from './transaction-tags.service';
import { TransactionTagsController } from './transaction-tags.controller';
import { TransactionTag } from './entities/transaction-tag.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionTag, Transaction]),
    AuthModule
  ],
  controllers: [TransactionTagsController],
  providers: [TransactionTagsService],
  exports: [TransactionTagsService]
})
export class TransactionTagsModule {}
