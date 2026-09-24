import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { ComplianceGateway } from './compliance.gateway';
import { ComplianceMetricsSnapshot } from './entities/compliance-snapshot.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ComplianceMetricsSnapshot])],
  controllers: [ComplianceController],
  providers: [ComplianceService, ComplianceGateway],
  exports: [ComplianceService],
})
export class ComplianceModule {}