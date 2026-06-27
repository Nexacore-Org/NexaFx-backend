import { Module, Global } from '@nestjs/common';
import { PaginationService } from './services/pagination.service';
import { DateService } from './services/date.service';
import { EncryptionService } from './services/encryption.service';
import {
  IdempotencyService,
  IdempotencyRedisCache,
} from './services/idempotency.service';

@Global()
@Module({
  providers: [
    PaginationService,
    DateService,
    EncryptionService,
    IdempotencyRedisCache,
    IdempotencyService,
  ],
  exports: [
    PaginationService,
    DateService,
    EncryptionService,
    IdempotencyRedisCache,
    IdempotencyService,
  ],
})
export class CommonModule {}
