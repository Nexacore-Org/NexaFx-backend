import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntelligentSmsRoutingController } from './intelligent-sms-routing.controller';
import { IntelligentSmsRoutingService } from './intelligent-sms-routing.service';
import { SmsProviderRoute } from './entities/sms-provider-route.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SmsProviderRoute])],
  controllers: [IntelligentSmsRoutingController],
  providers: [IntelligentSmsRoutingService],
  exports: [IntelligentSmsRoutingService],
})
export class IntelligentSmsRoutingModule {}
