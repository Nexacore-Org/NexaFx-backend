import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SavingsRecommendation } from './entities/savings-recommendation.entity';
import { SavingsRecommendationsService } from './savings-recommendations.service';
import { SavingsRecommendationsController } from './savings-recommendations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SavingsRecommendation]),
    ScheduleModule.forRoot(),
  ],
  controllers: [SavingsRecommendationsController],
  providers: [SavingsRecommendationsService],
  exports: [SavingsRecommendationsService],
})
export class SavingsRecommendationsModule {}
