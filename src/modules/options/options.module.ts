import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { OptionContract } from './entities/option-contract.entity';
import { ExchangeRateSnapshot } from '../exchange-rates/entities/exchange-rate-snapshot.entity';
import { WalletsModule } from '../wallets/wallets.module';
import { OptionsService } from './options.service';
import { OptionsController } from './options.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([OptionContract, ExchangeRateSnapshot]),
    WalletsModule,
    ScheduleModule,
  ],
  controllers: [OptionsController],
  providers: [OptionsService],
  exports: [OptionsService],
})
export class OptionsModule {}
