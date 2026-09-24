import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { KycScreening } from './entities/kyc-screening.entity';
import { OfacEntry } from './entities/ofac-entry.entity';
import { SanctionsService } from './sanctions.service';
import { SanctionsController } from './sanctions.controller';
import { OpenSanctionsProvider } from './providers/open-sanctions.provider';
import { OfacProvider } from './providers/ofac.provider';
import { KycRecord } from '../kyc/entities/kyc.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([KycScreening, OfacEntry, KycRecord]),
    HttpModule,
  ],
  controllers: [SanctionsController],
  providers: [SanctionsService, OpenSanctionsProvider, OfacProvider],
  exports: [SanctionsService],
})
export class SanctionsModule {}
