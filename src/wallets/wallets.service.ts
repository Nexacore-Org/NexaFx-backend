import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { Wallet, StellarNetwork } from './entities/wallet.entity';
import { GenerateWalletDto, ImportWalletDto } from './dto/wallet.dto';
import { StellarService } from '../modules/stellar/stellar.service';
import { WalletBalanceResult } from '../modules/stellar/stellar.types';
import { EncryptionService } from '../common/services/encryption.service';
import Decimal from 'decimal.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_WALLETS_PER_USER = 20;
const MAX_LABEL_LENGTH = 64;
const DEFAULT_PRIMARY_LABEL = 'Primary';
const DEFAULT_IMPORTED_LABEL = 'Imported (watch-only)';

/** Stellar public keys start with G and are 56 characters of base32. */
const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface TransactionWalletContext {
  publicKey: string;
  encryptedSecretKey: string | null;
  /** True when the wallet has no stored secret key (watch-only). */
  isWatchOnly: boolean;
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
  isWatchOnly: boolean;
  network: StellarNetwork;
  createdAt: Date;
  updatedAt: Date;
  balances: WalletBalanceResult[];
  /** Non-null when a balance fetch fails for this wallet. */
  balanceError: string | null;
}

export interface WalletSummary {
  id: string;
  publicKey: string;
  label: string;
  isDefault: boolean;
  isWatchOnly: boolean;
  network: StellarNetwork;
  createdAt: Date;
}

export interface PaginatedWallets {
  items: WalletListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);
  private readonly network: StellarNetwork;

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly usersService: UsersService,
    private readonly stellarService: StellarService,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    // Resolve once at startup — the network does not change at runtime.
    const raw = this.configService.get<string>('STELLAR_NETWORK') ?? 'TESTNET';
    this.network =
      raw === 'PUBLIC' ? StellarNetwork.PUBLIC : StellarNetwork.TESTNET;
  }

  // ── Seeding ───────────────────────────────────────────────────────────────

  /**
   * Called after signup / managed-user creation when the User row already
   * holds keys. Idempotent — skips silently if the user already has wallets.
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
  async findByUserAndCurrency(
    userId: string,
    currency: string,
  ): Promise<Wallet> {
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
    this.assertValidStellarAddress(publicKey);

    const count = await this.walletRepository.count({ where: { userId } });
    if (count > 0) return;

    await this.walletRepository.save(
      this.walletRepository.create({
        userId,
        publicKey,
        encryptedSecretKey,
        label: DEFAULT_PRIMARY_LABEL,
        isDefault: true,
        network: this.network,
      }),
    );

    this.logger.log(`Seeded primary wallet for user ${userId}`);
  }

  /**
   * Create a wallet with a prefilled balance for a user (e.g. sandbox seeding).
   * Idempotent — a wallet for the same user/currency is not duplicated.
   */
  async create(
    userId: string,
    currency: string,
    balance: string,
  ): Promise<Wallet> {
    const targetCurrency = currency.trim().toUpperCase();
    const existing = await this.walletRepository.findOne({
      where: { userId, currency: targetCurrency },
    });
    if (existing) return existing;

    const wallet = this.walletRepository.create({
      userId,
      currency: targetCurrency,
      balance,
      label: 'Sandbox',
      network: this.network,
    });
    return this.walletRepository.save(wallet);
  }

  /**
   * Delete every wallet owned by a user (used when resetting a sandbox).
   */
  async deleteByUserId(userId: string): Promise<void> {
    await this.walletRepository.delete({ userId });
  }

  // ── Resolution ────────────────────────────────────────────────────────────

  /**
   * Resolve the wallet context needed to sign a transaction.
   * Priority: explicit walletId → user's default wallet → legacy User row.
   *
   * @throws NotFoundException when an explicit walletId is not found.
   * @throws BadRequestException when the resolved wallet is watch-only.
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
    options: { allowWatchOnly?: boolean } = {},
  ): Promise<TransactionWalletContext> {
    let wallet: Wallet | null = null;

    if (walletId) {
      wallet = await this.walletRepository.findOne({
        where: { id: walletId, userId },
      });
      if (!wallet) throw new NotFoundException('Wallet not found');
    } else {
      wallet = await this.walletRepository.findOne({
        where: { userId, isDefault: true },
      });
    }

    if (wallet) {
      if (!options.allowWatchOnly && !wallet.encryptedSecretKey) {
        throw new BadRequestException(
          'The selected wallet is watch-only and cannot sign transactions.',
        );
      }
      return this.toTransactionContext(wallet);
    }

    // Legacy fallback: keys stored directly on the User row.
    const user = await this.usersService.findById(userId);
    if (!user?.walletPublicKey) {
      throw new BadRequestException(
        'No Stellar wallet is configured for this account.',
      );
    }

    return {
      publicKey: user.walletPublicKey,
      encryptedSecretKey: user.walletSecretKeyEncrypted ?? null,
      isWatchOnly: !user.walletSecretKeyEncrypted,
    };
  }

  // ── Listing ───────────────────────────────────────────────────────────────

  /**
   * Return all wallets for a user with live balances.
   * Balance fetches run concurrently; a failure on one wallet does not prevent
   * the others from being returned.
   */
  async listWallets(
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<PaginatedWallets> {
    const safePageSize = Math.min(Math.max(1, pageSize), 50);
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * safePageSize;

    const [wallets, total] = await this.walletRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'ASC' },
      skip,
      take: safePageSize,
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

    return {
      items: withBalances,
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  /**
   * Return a single wallet owned by the user, with live balances.
   */
  async getWallet(userId: string, walletId: string): Promise<WalletListItem> {
    const wallet = await this.requireOwnedWallet(userId, walletId);
    return this.toListItem(wallet);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  /**
   * Generate a new Stellar keypair, encrypt the secret, and persist the wallet.
   */
  async generateWallet(
    userId: string,
    dto?: GenerateWalletDto,
  ): Promise<WalletSummary> {
    await this.assertBelowWalletLimit(userId);

    const label = this.sanitizeLabel(
      dto?.label,
      await this.nextAutoLabel(userId),
    );

    const generated = await this.stellarService.generateWallet(userId, {
      source: 'wallets.generate',
    });
    const encrypted = this.encryptionService.encrypt(generated.secretKey);

    const saved = await this.walletRepository.save(
      this.walletRepository.create({
        userId,
        publicKey: generated.publicKey,
        encryptedSecretKey: encrypted,
        label,
        isDefault: false,
        network: this.network,
      }),
    );

    this.logger.log(
      `Generated wallet ${saved.id} (${saved.publicKey}) for user ${userId}`,
    );

    return this.toSummary(saved);
  }

  /**
   * Import an existing Stellar address as a watch-only wallet.
   * The secret key is never stored.
   */
  async importWatchOnly(
    userId: string,
    dto: ImportWalletDto,
  ): Promise<WalletSummary> {
    await this.assertBelowWalletLimit(userId);

    const publicKey = dto.publicKey.trim();
    this.assertValidStellarAddress(publicKey);

    const duplicate = await this.walletRepository.findOne({
      where: { userId, publicKey },
    });
    if (duplicate) {
      throw new BadRequestException(
        'This wallet address is already linked to your account.',
      );
    }

    const label = this.sanitizeLabel(dto.label, DEFAULT_IMPORTED_LABEL);

    const saved = await this.walletRepository.save(
      this.walletRepository.create({
        userId,
        publicKey,
        encryptedSecretKey: null,
        label,
        isDefault: false,
        network: this.network,
      }),
    );

    this.logger.log(
      `Imported watch-only wallet ${saved.id} (${publicKey}) for user ${userId}`,
    );

    return this.toSummary(saved);
  }

  /**
   * Rename a wallet. The label is trimmed and capped at 64 characters.
   */
  async updateLabel(
    userId: string,
    walletId: string,
    label: string,
  ): Promise<WalletSummary> {
    const wallet = await this.requireOwnedWallet(userId, walletId);
    const sanitized = this.sanitizeLabel(label);

    if (!sanitized) {
      throw new BadRequestException('Label must not be empty.');
    }

    wallet.label = sanitized;
    const saved = await this.walletRepository.save(wallet);
    return this.toSummary(saved);
  }

  /**
   * Make a wallet the default for a user.
   * Atomically clears all other defaults and syncs the User row in one
   * database transaction.
   */
  async setDefault(userId: string, walletId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const walletRepo = manager.getRepository(Wallet);

      const target = await walletRepo.findOne({
        where: { id: walletId, userId },
      });
      if (!target) throw new NotFoundException('Wallet not found');

      if (target.isDefault) return; // already default — nothing to do

      // Clear all defaults first, then set the target.
      await walletRepo.update(
        { userId, isDefault: true },
        { isDefault: false },
      );
      await walletRepo.update({ id: walletId }, { isDefault: true });

      // Keep the User row in sync so legacy code still works.
      const userUpdate: Partial<User> = { walletPublicKey: target.publicKey };
      if (target.encryptedSecretKey != null) {
        userUpdate.walletSecretKeyEncrypted = target.encryptedSecretKey;
      }
      if (Object.keys(userUpdate).length > 0) {
        await manager.getRepository(User).update(userId, userUpdate);
      }
    });

    this.logger.log(`Set wallet ${walletId} as default for user ${userId}`);
  }

  /**
   * Delete a non-default wallet.
   * The user must have at least two wallets before one can be deleted.
   */
  async deleteWallet(userId: string, walletId: string): Promise<void> {
    const wallet = await this.requireOwnedWallet(userId, walletId);

    if (wallet.isDefault) {
      throw new BadRequestException(
        'Cannot delete the default wallet. Set another wallet as default first.',
      );
    }

    const total = await this.walletRepository.count({ where: { userId } });
    if (total <= 1) {
      throw new BadRequestException(
        'You cannot delete your only wallet. ' +
          'Import or generate another wallet first.',
      );
    }

    await this.walletRepository.delete({ id: walletId, userId });
    this.logger.log(`Deleted wallet ${walletId} for user ${userId}`);
  }

  // ── Private — helpers ─────────────────────────────────────────────────────

  private async requireOwnedWallet(
    userId: string,
    walletId: string,
  ): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId, userId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  private async assertBelowWalletLimit(userId: string): Promise<void> {
    const count = await this.walletRepository.count({ where: { userId } });
    if (count >= MAX_WALLETS_PER_USER) {
      throw new BadRequestException(
        `You have reached the maximum of ${MAX_WALLETS_PER_USER} wallets per account.`,
      );
    }
  }

  private assertValidStellarAddress(address: string): void {
    if (!STELLAR_ADDRESS_RE.test(address)) {
      throw new BadRequestException(
        `"${address}" is not a valid Stellar public key.`,
      );
    }
  }

  /**
   * Trim, cap, and fall back to `fallback` when the provided label is blank.
   */
  private sanitizeLabel(
    label: string | undefined | null,
    fallback = '',
  ): string {
    const trimmed = (label ?? '').trim().slice(0, MAX_LABEL_LENGTH);
    return trimmed || fallback;
  }

  /**
   * Produce the next auto-label ("Wallet 1", "Wallet 2", …) based on the
   * current wallet count for the user.
   */
  private async nextAutoLabel(userId: string): Promise<string> {
    const count = await this.walletRepository.count({ where: { userId } });
    return `Wallet ${count + 1}`;
  }

  /**
   * Fetch live balances for a wallet, capturing errors so one failed RPC call
   * does not break the entire list response.
   */
  private async toListItem(wallet: Wallet): Promise<WalletListItem> {
    let balances: WalletBalanceResult[] = [];
    let balanceError: string | null = null;

    try {
      balances = await this.stellarService.getWalletBalances(wallet.publicKey);
    } catch (err) {
      balanceError =
        err instanceof Error ? err.message : 'Failed to fetch balances';
      this.logger.warn(
        `Balance fetch failed for wallet ${wallet.id}: ${balanceError}`,
      );
    }

    return {
      ...this.toSummary(wallet),
      balances,
      balanceError,
    };
  }

  private toSummary(wallet: Wallet): WalletSummary {
    return {
      id: wallet.id,
      publicKey: wallet.publicKey,
      label: wallet.label,
      isDefault: wallet.isDefault,
      isWatchOnly: !wallet.encryptedSecretKey,
      network: wallet.network,
      createdAt: wallet.createdAt,
    };
  }

  private toTransactionContext(wallet: Wallet): TransactionWalletContext {
    return {
      publicKey: wallet.publicKey,
      encryptedSecretKey: wallet.encryptedSecretKey,
      isWatchOnly: !wallet.encryptedSecretKey,
    };
  }
}
