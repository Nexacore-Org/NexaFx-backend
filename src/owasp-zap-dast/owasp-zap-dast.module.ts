import { Module } from '@nestjs/common';
import { OwaspZapDastController } from './owasp-zap-dast.controller';
import { OwaspZapDastService } from './owasp-zap-dast.service';

@Module({
  controllers: [OwaspZapDastController],
  providers: [OwaspZapDastService],
  exports: [OwaspZapDastService],
})
export class OwaspZapDastModule {}
