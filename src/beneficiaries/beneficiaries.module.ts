import { Module } from '@nestjs/common';
import { BeneficiariesService } from './beneficiaries.service';
import { BeneficiariesController } from './beneficiaries.controller';

@Module({
  controllers: [BeneficiariesController],
  providers: [BeneficiariesService],
})
export class BeneficiariesModule {}
