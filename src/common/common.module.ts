import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaginationService } from './services/pagination.service';
import { DateService } from './services/date.service';
import { EncryptionService } from './services/encryption.service';
import { IdempotencyService } from './services/idempotency.service';
import { IdempotencyRecord } from './entities/idempotency-record.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyRecord])],
  providers: [
    PaginationService,
    DateService,
    EncryptionService,
    IdempotencyService,
  ],
  exports: [
    PaginationService,
    DateService,
    EncryptionService,
    IdempotencyService,
  ],
})
export class CommonModule {}
