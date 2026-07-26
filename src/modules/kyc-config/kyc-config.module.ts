import { Module } from '@nestjs/common';
import { KycConfigService } from './kyc-config.service';
import { KycConfigController } from './kyc-config.controller';

@Module({
  controllers: [KycConfigController],
  providers: [KycConfigService],
  exports: [KycConfigService],
})
export class KycConfigModule {}
