import { Module } from '@nestjs/common';
import { FraudRiskScoringController } from './fraud-risk-scoring.controller';
import { FraudRiskScoringService } from './fraud-risk-scoring.service';

@Module({
  controllers: [FraudRiskScoringController],
  providers: [FraudRiskScoringService],
  exports: [FraudRiskScoringService],
})
export class FraudRiskScoringModule {}
