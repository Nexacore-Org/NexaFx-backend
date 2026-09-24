import { Module } from '@nestjs/common';
import { MobileSdkGuideController } from './mobile-sdk-guide.controller';
import { MobileSdkGuideService } from './mobile-sdk-guide.service';

@Module({
  controllers: [MobileSdkGuideController],
  providers: [MobileSdkGuideService],
  exports: [MobileSdkGuideService],
})
export class MobileSdkGuideModule {}
