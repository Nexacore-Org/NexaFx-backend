import { Global, Module } from '@nestjs/common';
import { IpBlocklistService } from './ip-blocklist.service';
import { IpBlocklistGuard } from './ip-blocklist.guard';

@Global()
@Module({
  providers: [IpBlocklistService, IpBlocklistGuard],
  exports: [IpBlocklistService, IpBlocklistGuard],
})
export class IpBlocklistModule {}