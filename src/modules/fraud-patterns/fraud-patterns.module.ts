import { Module } from '@nestjs/common';
import { FraudPatternsService } from './fraud-patterns.service';
import { FraudPatternsController } from './fraud-patterns.controller';

@Module({
  controllers: [FraudPatternsController],
  providers: [FraudPatternsService],
  exports: [FraudPatternsService],
})
export class FraudPatternsModule {}
