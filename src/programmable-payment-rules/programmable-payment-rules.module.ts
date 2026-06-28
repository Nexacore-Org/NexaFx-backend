import { Module } from '@nestjs/common';
import { ProgrammablePaymentRulesController } from './programmable-payment-rules.controller';
import { ProgrammablePaymentRulesService } from './programmable-payment-rules.service';

@Module({
  controllers: [ProgrammablePaymentRulesController],
  providers: [ProgrammablePaymentRulesService],
  exports: [ProgrammablePaymentRulesService],
})
export class ProgrammablePaymentRulesModule {}
