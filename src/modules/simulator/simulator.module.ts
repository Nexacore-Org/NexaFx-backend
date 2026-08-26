import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExchangeRateSnapshot } from '../exchange-rate/entities/exchange-rate-snapshot.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { RedisModule } from '../redis/redis.module';
import { WalletsModule } from '../wallets/wallets.module';
import { SimulatorService } from './simulator.service';
import { SimulatorController } from './simulator.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExchangeRateSnapshot, Wallet]),
    RedisModule,
    WalletsModule,
  ],
  controllers: [SimulatorController],
  providers: [SimulatorService],
  exports: [SimulatorService],
})
export class SimulatorModule {}
