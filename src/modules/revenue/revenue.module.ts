import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RevenueSnapshot } from './entities/revenue-snapshot.entity';
import { RevenueService } from './revenue.service';
import { RevenueController } from './revenue.controller';
import { Transaction } from '../../transactions/entities/transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RevenueSnapshot, Transaction])],
  controllers: [RevenueController],
  providers: [RevenueService],
  exports: [RevenueService],
})
export class RevenueModule {}
