import { Module } from '@nestjs/common';
import { StellarModule } from './stellar/stellar.module';

@Module({
  imports: [StellarModule],
  exports: [StellarModule],
})
export class BlockchainModule {}
