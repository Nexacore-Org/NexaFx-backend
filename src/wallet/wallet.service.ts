import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { HorizonService } from 'src/blockchain/services/horizon/horizon.service';

@Injectable()
export class WalletService {
  isFrozen(recipientWallet: any) {
       throw new Error('Method not implemented.');
  }
  getBalance(senderWallet: any) {
       throw new Error('Method not implemented.');
  }
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly horizonService: HorizonService,
  ) {}

  async create(
    userId: string,
    createWalletDto: CreateWalletDto,
  ): Promise<Wallet> {
    // Check if user already has a wallet
    const existingWallet = await this.walletRepository.findOne({
      where: { userId },
    });
    if (existingWallet) {
      throw new ConflictException('User already has a wallet');
    }

    const wallet = this.walletRepository.create({
      userId,
      ...createWalletDto,
    });

    return this.walletRepository.save(wallet);
  }

  async findAll(userId: string): Promise<Wallet[]> {
    return this.walletRepository.find({ where: { userId } });
  }

  async findOne(id: string, userId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { id, userId },
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet;
  }

  async update(
    id: string,
    userId: string,
    updateWalletDto: UpdateWalletDto,
  ): Promise<Wallet> {
    const wallet = await this.findOne(id, userId);

    // If setting as primary, unset any other primary wallets
    if (updateWalletDto.isPrimary) {
      await this.walletRepository.update(
        { userId, isPrimary: true },
        { isPrimary: false },
      );
    }

    Object.assign(wallet, updateWalletDto);
    return this.walletRepository.save(wallet);
  }

  async remove(id: string, userId: string): Promise<void> {
    const wallet = await this.findOne(id, userId);
    await this.walletRepository.remove(wallet);
  }

  async getWalletBalances(accountId: string) {
    return this.horizonService.getAccountBalances(accountId);
  }

  /**
   * Aggregate wallet balances for all wallets of a user across all supported currencies.
   * Returns an array of { currency, balance, locked? }
   */
  async getUserBalances(userId: string) {
    // Get all wallets for the user
    const wallets = await this.walletRepository.find({ where: { userId } });
    if (!wallets.length) return [];

    // Explicitly type the balances array
    const balances: Array<{
      currency: string;
      balance: string;
      locked: string;
      type: string;
      walletId: string;
    }> = [];
    for (const wallet of wallets) {
      if (wallet.stellarAddress) {
        const stellarBalances = await this.getWalletBalances(wallet.stellarAddress);
        for (const b of stellarBalances as any[]) {
          balances.push({
            currency: b.asset_code || b.asset_type,
            balance: b.balance,
            locked: b.locked || '0', // If locked is available, otherwise 0
            type: 'stellar',
            walletId: wallet.id,
          });
        }
      }
      // Add similar logic for metamaskAddress or other currencies if needed
    }
    return balances;
  }
}
