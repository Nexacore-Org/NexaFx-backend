import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { User } from './user.entity';
import { RateLimitConfig } from './rate-limit-config.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RateLimitConfig]),
    ThrottlerModule,
    BlockchainModule,
    ExchangeRatesModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
