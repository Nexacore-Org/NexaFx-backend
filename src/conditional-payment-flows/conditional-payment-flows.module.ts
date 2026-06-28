import { Module } from '@nestjs/common';
import { ConditionalPaymentFlowsController } from './conditional-payment-flows.controller';
import { ConditionalPaymentFlowsService } from './conditional-payment-flows.service';

@Module({
  controllers: [ConditionalPaymentFlowsController],
  providers: [ConditionalPaymentFlowsService],
  exports: [ConditionalPaymentFlowsService],
})
export class ConditionalPaymentFlowsModule {}
