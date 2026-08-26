import { Module } from '@nestjs/common';
import { OpenidConnectService } from './openid-connect.service';
import { OpenidConnectController } from './openid-connect.controller';

@Module({
  controllers: [OpenidConnectController],
  providers: [OpenidConnectService],
  exports: [OpenidConnectService],
})
export class OpenidConnectModule {}
