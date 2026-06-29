import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmlService } from './aml.service';
import { ComplianceFlagService } from './compliance-flag.service';
import { SarService } from './sar.service';
import { ComplianceConfigService } from './compliance-config.service';
import { ComplianceController } from './compliance.controller';
import { AmlCheckProcessor } from './processors/aml-check.processor';
import { ComplianceFlag } from './entities/compliance-flag.entity';
import { Sar } from './entities/sar.entity';
import { AmlConfig } from './entities/aml-config.entity';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'aml-check' }),
    TypeOrmModule.forFeature([ComplianceFlag, Sar, AmlConfig]),
  ],
  providers: [
    AmlService,
    ComplianceFlagService,
    SarService,
    ComplianceConfigService,
    AmlCheckProcessor,
  ],
  controllers: [ComplianceController],
  exports: [
    AmlService,
    ComplianceFlagService,
    SarService,
    ComplianceConfigService,
  ],
})
export class ComplianceModule {}
