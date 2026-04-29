import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { User } from './user.entity';
import { RateLimitConfig } from './rate-limit-config.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { DataExportService } from './services/data-export.service';
import { AccountDeletionService } from './services/account-deletion.service';
import { DataRequest } from './entities/data-request.entity';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RateLimitConfig, DataRequest]),
    ThrottlerModule,
    BlockchainModule,
    ExchangeRatesModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, DataExportService, AccountDeletionService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
