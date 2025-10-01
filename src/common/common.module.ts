import { Global, Module } from '@nestjs/common';
import { SmsService } from './services/sms.service';

@Global()
@Module({
  providers: [SmsService],
  exports: [SmsService],
})
export class CommonModule {}


