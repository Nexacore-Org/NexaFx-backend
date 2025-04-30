import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager'; // <-- Add this line
import { StellarService } from './services/stellar.service';
import { BlockchainController } from './controllers/blockchain.controller';
import { HorizonService } from './services/horizon/horizon.service';

@Module({
  imports: [ConfigModule, CacheModule.register()], // <-- Add CacheModule here
  providers: [StellarService, HorizonService],
  controllers: [BlockchainController],
  exports: [StellarService, HorizonService], // <-- Export services if needed in other modules
})
export class BlockchainModule {}