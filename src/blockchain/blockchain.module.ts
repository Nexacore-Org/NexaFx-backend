import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StellarService } from './services/stellar.service';
import { BlockchainController } from './controllers/blockchain.controller';

@Module({
  imports: [ConfigModule],
  providers: [StellarService],
  controllers: [BlockchainController],
  exports: [StellarService],
})
export class BlockchainModule {}