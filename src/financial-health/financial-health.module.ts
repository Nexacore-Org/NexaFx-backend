import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinancialHealthController } from './financial-health.controller';
import { FinancialHealthService } from './financial-health.service';
import { FinancialHealthScore } from './entities/financial-health-score.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FinancialHealthScore])],
  controllers: [FinancialHealthController],
  providers: [FinancialHealthService],
  exports: [FinancialHealthService],
})
export class FinancialHealthModule {}