import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinancialInsight } from './entities/financial-insight.entity';
import { FinancialInsightsService } from './financial-insights.service';
import { FinancialInsightsController } from './financial-insights.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FinancialInsight])],
  controllers: [FinancialInsightsController],
  providers: [FinancialInsightsService],
  exports: [FinancialInsightsService],
})
export class FinancialInsightsModule {}
