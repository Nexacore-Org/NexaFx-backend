import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BridgePrepController } from './bridge-prep.controller';
import { BridgePrepService } from './bridge-prep.service';
import { AddressValidationService } from './services/address-validation.service';
import { BlockchainNetwork } from './entities/blockchain-network.entity';
import { ExternalWalletAddress } from './entities/external-wallet-address.entity';
import { BridgeTransaction } from './entities/bridge-transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BlockchainNetwork, ExternalWalletAddress, BridgeTransaction])],
  controllers: [BridgePrepController],
  providers: [BridgePrepService, AddressValidationService],
  exports: [BridgePrepService, AddressValidationService],
})
export class BridgePrepModule {}