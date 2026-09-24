import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockchainNetwork } from './entities/blockchain-network.entity';
import { ExternalWalletAddress } from './entities/external-wallet-address.entity';
import { AddressValidationService } from './services/address-validation.service';

@Injectable()
export class BridgePrepService {
  constructor(
    @InjectRepository(BlockchainNetwork) private readonly networkRepo: Repository<BlockchainNetwork>,
    @InjectRepository(ExternalWalletAddress) private readonly walletRepo: Repository<ExternalWalletAddress>,
    private readonly validationService: AddressValidationService,
  ) {}

  async getAllNetworks(): Promise<BlockchainNetwork[]> {
    return this.networkRepo.find({ where: { isActive: true } });
  }

  async getBridgeStatus(): Promise<{ live: string[]; comingSoon: string[] }> {
    const networks = await this.networkRepo.find({ where: { isActive: true } });
    
    return {
      live: networks.filter(n => n.isSupported).map(n => n.name),
      comingSoon: networks.filter(n => !n.isSupported).map(n => n.name),
    };
  }

  async saveWallet(userId: string, networkId: string, address: string, label?: string): Promise<ExternalWalletAddress> {
    const network = await this.networkRepo.findOne({ where: { id: networkId } });
    if (!network) throw new NotFoundException('Target blockchain network profile missing');

    // Run format validation matching ONLY the active target chain rules
    const result = this.validationService.validate(address, network.addressFormat);
    if (!result.valid) {
      throw new BadRequestException(result.error || 'Address format validation failed');
    }

    const wallet = this.walletRepo.create({
      userId,
      networkId,
      address,
      label,
      isVerified: false,
    });

    return this.walletRepo.save(wallet);
  }

  async getUserWallets(userId: string): Promise<ExternalWalletAddress[]> {
    return this.walletRepo.find({ where: { userId }, relations: ['network'] });
  }

  async removeWallet(id: string, userId: string): Promise<void> {
    const wallet = await this.walletRepo.findOne({ where: { id, userId } });
    if (!wallet) throw new NotFoundException('Wallet configuration map missing inside scope');
    await this.walletRepo.remove(wallet);
  }

  async initiateVerification(id: string, userId: string): Promise<any> {
    const wallet = await this.walletRepo.findOne({ where: { id, userId } });
    if (!wallet) throw new NotFoundException('Target wallet profile unassigned');
    
    // In future versions, this initializes cryptographic signature payloads
    return { id, verificationStatus: 'CHALLENGE_GENERATED', challenge: 'Sign this state update footprint' };
  }
}