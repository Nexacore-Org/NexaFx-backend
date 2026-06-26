import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { Wallet, StellarNetwork } from './entities/wallet.entity';
import { GenerateWalletDto, ImportWalletDto } from './dto/wallet.dto';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { WalletBalanceResult } from '../blockchain/stellar/stellar.types';
import { EncryptionService } from '../common/services/encryption.service';
import Decimal from 'decimal.js';

export interface TransactionWalletContext {
  publicKey: string;
  encryptedSecretKey: string | null;
}

export interface WalletListItem {
  id: string;
  userId: string;
  currency: string;
  balance: string;
  publicKey: string | null;
  encryptedSecretKey: string | null;
  label: string;
  isDefault: boolean;
  network: StellarNetwork;
  createdAt: Date;
  updatedAt: Date;
  balances: WalletBalanceResult[];
}

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly usersService: UsersService,
    private readonly stellarService: StellarService,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  private getNetwork(): StellarNetwork {
    const raw = this.configService.get<string>('STELLAR_NETWORK') ?? 'TESTNET';
    return raw === 'PUBLIC' ? StellarNetwork.PUBLIC : StellarNetwork.TESTNET;
  }

  /**
   * Return only authenticated user's wallets
   */
  async findAllByUser(userId: string): Promise<Wallet[]> {
    return this.walletRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Return specific wallet of the authenticated user
   */
  async findByUserAndCurrency(userId: string, currency: string): Promise<Wallet> {
    const targetCurrency = currency.trim().toUpperCase();
    const wallet = await this.walletRepository.findOne({
      where: { userId, currency: targetCurrency },
    });
    if (!wallet) {
      throw new NotFoundException(
        `Wallet with currency '${targetCurrency}' not found for this user`,
      );
    }
    return wallet;
  }

  /**
   * Integrates into the signup/creation flow to seed the default XLM wallet
   */
  async seedPrimaryWalletFromUserCredentials(
    userId: string,
    publicKey: string,
    encryptedSecretKey: string,
  ): Promise<void> {
    const existing = await this.walletRepository.findOne({
      where: { userId, currency: 'XLM' },
    });
    if (existing) {
      return;
    }

    const defaultWallet = this.walletRepository.create({
      userId,
      currency: 'XLM',
      balance: '0.00000000',
      isDefault: true,
      publicKey,
      encryptedSecretKey,
      label: 'Primary',
      network: this.getNetwork(),
    });

    await this.walletRepository.save(defaultWallet);
  }

  /**
   * Resolves the wallet context for Stellar blockchain transactions, ensuring
   * compatibility with transactions and super-admin modules.
   */
  async resolveWalletForTransaction(
    userId: string,
    walletId?: string,
  ): Promise<TransactionWalletContext> {
    if (walletId) {
      const wallet = await this.walletRepository.findOne({
        where: { id: walletId, userId },
      });
      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      const user = await this.usersService.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      return {
        publicKey: wallet.publicKey || user.walletPublicKey,
        encryptedSecretKey: wallet.encryptedSecretKey || user.walletSecretKeyEncrypted,
      };
    }

    // Resolve user's default wallet
    const defaultWallet = await this.walletRepository.findOne({
      where: { userId, isDefault: true },
    });

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      publicKey: defaultWallet?.publicKey || user.walletPublicKey,
      encryptedSecretKey: defaultWallet?.encryptedSecretKey || user.walletSecretKeyEncrypted,
    };
  }

  async listWallets(userId: string): Promise<WalletListItem[]> {
    const wallets = await this.walletRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });

    const withBalances = await Promise.all(
      wallets.map(async (w) => {
        let balances: WalletBalanceResult[] = [];
        if (w.publicKey) {
          try {
            balances = await this.stellarService.getWalletBalances(w.publicKey);
          } catch {
            // Friendbot/balance check might fail or time out in testnets
          }
        }
        return {
          id: w.id,
          userId: w.userId,
          currency: w.currency,
          balance: w.balance,
          publicKey: w.publicKey,
          encryptedSecretKey: w.encryptedSecretKey,
          label: w.label,
          isDefault: w.isDefault,
          network: w.network,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
          balances,
        };
      }),
    );

    return withBalances;
  }

  async generateWallet(
    userId: string,
    dto?: GenerateWalletDto,
  ): Promise<Omit<WalletListItem, 'balances'>> {
    const existing = await this.walletRepository.count({ where: { userId } });
    const label =
      dto?.label?.trim() || `Wallet ${existing > 0 ? existing + 1 : 1}`;

    const generated = await this.stellarService.generateWallet(userId, {
      source: 'wallets.generate',
    });
    const encrypted = this.encryptionService.encrypt(generated.secretKey);

    const wallet = this.walletRepository.create({
      userId,
      publicKey: generated.publicKey,
      encryptedSecretKey: encrypted,
      label,
      isDefault: false,
      network: this.getNetwork(),
      currency: 'XLM',
      balance: '0.00000000',
    });
    const saved = await this.walletRepository.save(wallet);

    if (saved.publicKey) {
      try {
        await this.stellarService.fundTestnetWallet(saved.publicKey);
      } catch {
        // Friendbot funding is best-effort for newly generated wallets.
      }
    }

    return {
      id: saved.id,
      userId: saved.userId,
      currency: saved.currency,
      balance: saved.balance,
      publicKey: saved.publicKey,
      encryptedSecretKey: saved.encryptedSecretKey,
      label: saved.label,
      isDefault: saved.isDefault,
      network: saved.network,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  async importWatchOnly(
    userId: string,
    dto: ImportWalletDto,
  ): Promise<Omit<WalletListItem, 'balances'>> {
    const normalized = dto.publicKey.trim();
    const dup = await this.walletRepository.findOne({
      where: { userId, publicKey: normalized },
    });
    if (dup) {
      throw new BadRequestException(
        'This wallet is already linked to your account',
      );
    }

    const label = dto.label?.trim() || 'Imported (watch-only)';

    const wallet = this.walletRepository.create({
      userId,
      publicKey: normalized,
      encryptedSecretKey: null,
      label,
      isDefault: false,
      network: this.getNetwork(),
      currency: 'XLM',
      balance: '0.00000000',
    });
    const saved = await this.walletRepository.save(wallet);

    return {
      id: saved.id,
      userId: saved.userId,
      currency: saved.currency,
      balance: saved.balance,
      publicKey: saved.publicKey,
      encryptedSecretKey: saved.encryptedSecretKey,
      label: saved.label,
      isDefault: saved.isDefault,
      network: saved.network,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  async updateLabel(
    userId: string,
    walletId: string,
    label: string,
  ): Promise<Omit<WalletListItem, 'balances'>> {
    const wallet = await this.requireOwnedWallet(userId, walletId);
    wallet.label = label.trim();
    const saved = await this.walletRepository.save(wallet);
    return {
      id: saved.id,
      userId: saved.userId,
      currency: saved.currency,
      balance: saved.balance,
      publicKey: saved.publicKey,
      encryptedSecretKey: saved.encryptedSecretKey,
      label: saved.label,
      isDefault: saved.isDefault,
      network: saved.network,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  async setDefault(userId: string, walletId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const walletRepo = manager.getRepository(Wallet);

      const target = await walletRepo.findOne({
        where: { id: walletId, userId },
      });
      if (!target) {
        throw new NotFoundException('Wallet not found');
      }

      await walletRepo.update({ userId }, { isDefault: false });
      await walletRepo.update({ id: walletId, userId }, { isDefault: true });

      const userUpdate: Partial<User> = {};
      if (target.publicKey) {
        userUpdate.walletPublicKey = target.publicKey;
      }
      if (target.encryptedSecretKey != null) {
        userUpdate.walletSecretKeyEncrypted = target.encryptedSecretKey;
      }
      if (Object.keys(userUpdate).length > 0) {
        await manager.getRepository(User).update(userId, userUpdate);
      }
    });
  }

  async deleteWallet(userId: string, walletId: string): Promise<void> {
    const total = await this.walletRepository.count({ where: { userId } });
    if (total <= 1) {
      throw new BadRequestException(
        'You cannot delete your only wallet. Import or generate another wallet first.',
      );
    }

    const wallet = await this.walletRepository.findOne({
      where: { id: walletId, userId },
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    if (wallet.isDefault) {
      throw new BadRequestException(
        'Cannot delete the default wallet. Set another wallet as default first.',
      );
    }

    await this.walletRepository.delete({ id: walletId, userId });
  }

  private async requireOwnedWallet(
    userId: string,
    walletId: string,
  ): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId, userId },
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet;
  }

  /**
   * Enforce Decimal Arithmetic Helper: Add balance
   */
  async addBalance(walletId: string, amount: string | number | Decimal): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({ where: { id: walletId } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const currentBalance = new Decimal(wallet.balance);
    const newBalance = currentBalance.plus(new Decimal(amount));

    wallet.balance = newBalance.toFixed(8);
    return this.walletRepository.save(wallet);
  }

  /**
   * Enforce Decimal Arithmetic Helper: Subtract balance
   */
  async subtractBalance(walletId: string, amount: string | number | Decimal): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({ where: { id: walletId } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const currentBalance = new Decimal(wallet.balance);
    const newBalance = currentBalance.minus(new Decimal(amount));

    if (newBalance.lessThan(0)) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    wallet.balance = newBalance.toFixed(8);
    return this.walletRepository.save(wallet);
  }
}
