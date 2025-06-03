import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
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
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,
    private readonly horizonService: HorizonService,
  ) {}

  /**
   * Auto-create wallet for user in specific currency if it doesn't exist
   * This is the core method for the auto-creation feature
   */
  async ensureWalletExists(
    userId: string,
    currencyCode: string,
  ): Promise<Wallet> {
    // First try to find existing wallet
    const existingWallet = await this.walletRepository.findOne({
      where: {
        userId,
        currency: { code: currencyCode },
      },
      relations: ['currency', 'user'],
    });

    if (existingWallet) {
      return existingWallet;
    }

    // Auto-create wallet if it doesn't exist
    this.logger.log(
      `Auto-creating wallet for user ${userId} in currency ${currencyCode}`,
    );
    return this.createWalletForCurrency(userId, currencyCode);
  }

  /**
   * Create a new wallet for a specific currency
   */
  private async createWalletForCurrency(
    userId: string,
    currencyCode: string,
  ): Promise<Wallet> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currency = await this.currencyRepository.findOne({
      where: { code: currencyCode },
    });
    if (!currency) {
      throw new NotFoundException(`Currency ${currencyCode} not found`);
    }

    // Check if user has any wallets, if not make this primary
    const userWalletCount = await this.walletRepository.count({
      where: { userId },
    });
    const isPrimary = userWalletCount === 0;

    const wallet = this.walletRepository.create({
      userId,
      currencyId: currency.id,
      user,
      currency,
      stellarAddress: '',
      metamaskAddress: '',
      isPrimary,
      status: 'active',
    });

    const savedWallet = await this.walletRepository.save(wallet);
    this.logger.log(
      `Created wallet ${savedWallet.id} for user ${userId} in ${currencyCode}`,
    );

    return savedWallet;
  }

  /**
   * Get or create wallet for conversion operations
   */
  async getOrCreateWalletForConversion(
    userId: string,
    currencyCode: string,
  ): Promise<Wallet> {
    try {
      return await this.ensureWalletExists(userId, currencyCode);
    } catch (error) {
      this.logger.error(
        `Failed to ensure wallet exists for conversion: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get or create wallet for transfer operations
   */
  async getOrCreateWalletForTransfer(
    userId: string,
    currencyCode: string,
  ): Promise<Wallet> {
    try {
      return await this.ensureWalletExists(userId, currencyCode);
    } catch (error) {
      this.logger.error(
        `Failed to ensure wallet exists for transfer: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get wallet by currency code for a user
   */
  async getWalletByCurrency(
    userId: string,
    currencyCode: string,
  ): Promise<Wallet | null> {
    return this.walletRepository.findOne({
      where: {
        userId,
        currency: { code: currencyCode },
      },
      relations: ['currency', 'user'],
    });
  }

  async createWallet(userId: string, currencyCode: string): Promise<Wallet> {
    return this.createWalletForCurrency(userId, currencyCode);
  }

  async getUserWallets(userId: string): Promise<Wallet[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.walletRepository.find({
      where: { userId },
      relations: ['currency', 'user'],
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
  }

  async getWalletById(id: number, userId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { id, userId },
      relations: ['currency', 'user'],
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
    const existingWallet = await this.getWalletByCurrency(
      userId,
      createWalletDto.currencyCode,
    );
    if (existingWallet) {
      throw new ConflictException(
        `User already has a wallet for currency ${createWalletDto.currencyCode}`,
      );
    }

    // If this is set as primary, unset any other primary wallets
    if (createWalletDto.isPrimary) {
      await this.walletRepository.update(
        { userId, isPrimary: true },
        { isPrimary: false },
      );
    }

    const currency = await this.currencyRepository.findOne({
      where: { code: createWalletDto.currencyCode },
    });
    if (!currency) {
      throw new NotFoundException('Currency not found');
    }

    const wallet = this.walletRepository.create({
      userId,
      currencyId: currency.id,
      user,
      currency,
      stellarAddress: createWalletDto.stellarAddress || '',
      metamaskAddress: createWalletDto.metamaskAddress || '',
      isPrimary: createWalletDto.isPrimary || false,
      status: 'active',
    });

    return this.walletRepository.save(wallet);
  }

  async findAll(userId: string): Promise<Wallet[]> {
    return this.walletRepository.find({
      where: { userId },
      relations: ['currency', 'user'],
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
  }

  async findOne(id: number, userId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { id, userId },
      relations: ['currency', 'user'],
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
        { userId, isPrimary: true },
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

  async getUserBalances(userId: string) {
    const wallets = await this.walletRepository.find({
      where: { userId },
      relations: ['currency', 'user'],
    });
    if (!wallets.length) return [];

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
            locked: b.locked || '0',
            type: 'stellar',
            walletId: wallet.id,
          });
        }
      }
    }
    return balances;
  }

  /**
   * ✅ Used in middleware: Returns true if wallet is frozen
   */
  async isFrozen(walletId: string): Promise<boolean> {
    const wallet = await this.walletRepository.findOne({
      where: { id: parseInt(walletId) },
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet.status === 'frozen';
  }

  /**
   * ✅ Used in middleware: Gets spendable balance from Stellar
   */
  async getBalance(walletId: string): Promise<number> {
    const wallet = await this.walletRepository.findOne({
      where: { id: parseInt(walletId) },
    });
    if (!wallet || !wallet.stellarAddress) {
      throw new NotFoundException('Wallet or Stellar address not found');
    }

    const balances = await this.getWalletBalances(wallet.stellarAddress);
    const nativeBalance = balances.find((b: any) => b.asset_type === 'native');
    const spendable = nativeBalance
      ? parseFloat(nativeBalance.balance) -
        parseFloat(nativeBalance.locked || '0')
      : 0;
    return Math.max(spendable, 0);
  }
}
