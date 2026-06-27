import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaginationService } from './services/pagination.service';
import { DateService } from './services/date.service';
import { EncryptionService } from './services/encryption.service';
import { IdempotencyService } from './services/idempotency.service';
import { IdempotencyRecord } from './entities/idempotency-record.entity';
import { RedisService } from './services/redis.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyRecord])],
  providers: [
    PaginationService,
    DateService,
    EncryptionService,
    IdempotencyService,
    RedisService,
  ],
  exports: [
    PaginationService,
    DateService,
    EncryptionService,
    IdempotencyService,
    RedisService,
  ],
})
export class CommonModule { }
