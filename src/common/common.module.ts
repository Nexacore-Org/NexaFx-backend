import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaginationService } from './services/pagination.service';
import { DateService } from './services/date.service';
import { EncryptionService } from './services/encryption.service';
import {
  IdempotencyService,
  IdempotencyRedisCache,
} from './services/idempotency.service';
import { IdempotencyRecord } from './entities/idempotency-record.entity';
import { RedisModule } from '../modules/redis/redis.module';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyRecord]), RedisModule],
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
    RedisModule,
  ],
})
export class CommonModule {}
