import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { KycScreening } from './entities/kyc-screening.entity';
import { OfacEntry } from './entities/ofac-entry.entity';
import { SanctionsService } from './sanctions.service';
import { SanctionsController } from './sanctions.controller';
import { OpenSanctionsProvider } from './providers/open-sanctions.provider';
import { OfacProvider } from './providers/ofac.provider';
import { User } from '../users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([KycScreening, OfacEntry, User]),
    HttpModule,
  ],
  controllers: [SanctionsController],
  providers: [SanctionsService, OpenSanctionsProvider, OfacProvider],
  exports: [SanctionsService],
})
export class SanctionsModule {}
