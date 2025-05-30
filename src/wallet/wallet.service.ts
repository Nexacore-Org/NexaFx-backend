import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { User } from '../user/entities/user.entity';
import { Currency } from '../currencies/entities/currency.entity';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';
import { HorizonService } from 'src/blockchain/services/horizon/horizon.service';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,
    private readonly horizonService: HorizonService,
  ) {}

  async createWallet(userId: string, currencyCode: string): Promise<Wallet> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currency = await this.currencyRepository.findOne({
      where: { code: currencyCode },
    });
    if (!currency) {
      throw new NotFoundException('Currency not found');
    }

    const wallet = new Wallet();
    wallet.user = user;
    wallet.stellarAddress = '';
    wallet.metamaskAddress = '';
    wallet.isPrimary = false;

    return this.walletRepository.save(wallet);
  }

  async getUserWallets(userId: string): Promise<Wallet[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.walletRepository.find({
      where: { user: { id: userId } },
      relations: ['user'],
    });
  }

  async getWalletById(id: number, userId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { id, user: { id: userId } },
      relations: ['user'],
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  async create(
    userId: string,
    createWalletDto: CreateWalletDto,
  ): Promise<Wallet> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user already has a wallet for this currency
    const existingWallet = await this.walletRepository.findOne({
      where: { user: { id: userId } },
    });
    if (existingWallet) {
      throw new ConflictException(
        'User already has a wallet for this currency',
      );
    }

    // If this is set as primary, unset any other primary wallets
    if (createWalletDto.isPrimary) {
      await this.walletRepository.update(
        { user: { id: userId }, isPrimary: true },
        { isPrimary: false },
      );
    }

    const wallet = new Wallet();
    wallet.user = user;
    wallet.stellarAddress = createWalletDto.stellarAddress || '';
    wallet.metamaskAddress = createWalletDto.metamaskAddress || '';
    wallet.isPrimary = createWalletDto.isPrimary || false;

    return this.walletRepository.save(wallet);
  }

  async findAll(userId: string): Promise<Wallet[]> {
    return this.walletRepository.find({
      where: { user: { id: userId } },
      relations: ['user'],
    });
  }

  async findOne(id: number, userId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { id, user: { id: userId } },
      relations: ['user'],
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet;
  }

  async update(
    id: number,
    userId: string,
    updateWalletDto: UpdateWalletDto,
  ): Promise<Wallet> {
    const wallet = await this.findOne(id, userId);

    // If setting as primary, unset any other primary wallets
    if (updateWalletDto.isPrimary) {
      await this.walletRepository.update(
        { user: { id: userId }, isPrimary: true },
        { isPrimary: false },
      );
    }

    Object.assign(wallet, updateWalletDto);
    return this.walletRepository.save(wallet);
  }

  async remove(id: number, userId: string): Promise<void> {
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
    const wallets = await this.walletRepository.find({
      where: { user: { id: userId } },
      relations: ['user'],
    });
    if (!wallets.length) return [];

    // Explicitly type the balances array
    const balances: Array<{
      currency: string;
      balance: string;
      locked: string;
      type: string;
      walletId: number;
    }> = [];
    for (const wallet of wallets) {
      if (wallet.stellarAddress) {
        const stellarBalances = await this.getWalletBalances(
          wallet.stellarAddress,
        );
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
