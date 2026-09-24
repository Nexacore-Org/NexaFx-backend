import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeoService } from './geo.service';
import { GeoCacheService } from './geo-cache.service';
import { FraudService } from './fraud.service';
import { FraudController } from './fraud.controller';
import { FraudAlert } from './entities/fraud-alert.entity';
import { LoginAttempt } from './entities/login-attempt.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FraudAlert, LoginAttempt])],
  controllers: [FraudController],
  providers: [GeoService, GeoCacheService, FraudService],
  exports: [FraudService, GeoService, GeoCacheService],
})
export class FraudModule {}
