import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './user.entity';
import {
  UpdateProfileDto,
  ProfileResponseDto,
  WalletBalancesResponseDto,
  WalletPortfolioResponseDto,
  PortfolioHoldingDto,
} from './dto';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { WalletBalanceResult } from '../blockchain/stellar/stellar.types';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';

interface WalletBalancesCacheEntry {
  expiresAt: number;
  payload: Omit<WalletBalancesResponseDto, 'cached'>;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly walletBalancesCache = new Map<
    string,
    WalletBalancesCacheEntry
  >();
  private readonly walletBalancesTtlMs = 30_000;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly stellarService: StellarService,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
    });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { phone },
    });
  }

  async findAllActive(): Promise<User[]> {
    return this.userRepository.find({
      where: { isVerified: true },
      select: ['id', 'email', 'firstName', 'lastName', 'role'],
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.userRepository.delete(id);
  }

  async updateByUserId(
    userId: string,
    updateData: Partial<User>,
  ): Promise<void> {
    await this.userRepository.update(userId, updateData);
  }

  async createUser(params: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    walletPublicKey: string;
    walletSecretKeyEncrypted: string;
    role?: UserRole;
  }): Promise<
    Omit<User, 'password' | 'walletSecretKeyEncrypted' | 'twoFactorSecret'>
  > {
    const normalizedEmail = params.email.toLowerCase().trim();

    const existingUser = await this.findByEmail(normalizedEmail);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    if (params.phone) {
      const existingPhone = await this.findByPhone(params.phone);
      if (existingPhone) {
        throw new ConflictException('User with this phone already exists');
      }
    }

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(params.password, saltRounds);

    const user = this.userRepository.create({
      email: normalizedEmail,
      password: hashedPassword,
      firstName: params.firstName || null,
      lastName: params.lastName || null,
      phone: params.phone || null,
      walletPublicKey: params.walletPublicKey,
      walletSecretKeyEncrypted: params.walletSecretKeyEncrypted,
      role: params.role || UserRole.USER,
      isVerified: false,
    });

    const savedUser = await this.userRepository.save(user);

    const {
      password: _,
      walletSecretKeyEncrypted: __,
      twoFactorSecret: ___,
      ...userWithoutSecrets
    } = savedUser;
    return userWithoutSecrets;
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await this.userRepository.update(userId, {
      password: hashedPassword,
    });
  }

  async verifyUser(userId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.update(userId, {
      isVerified: true,
    });
  }

  async updateRole(userId: string, role: UserRole): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.update(userId, { role });
  }

  async update(userId: string, data: Partial<User>): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.update(userId, data);
  }

  async getProfile(userId: string): Promise<ProfileResponseDto> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.excludeSecrets(user);
  }

  async getWalletBalances(
    userId: string,
    forceRefresh = false,
  ): Promise<WalletBalancesResponseDto> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const now = Date.now();
    const cached = this.walletBalancesCache.get(user.id);
    if (!forceRefresh && cached && cached.expiresAt > now) {
      return {
        ...cached.payload,
        cached: true,
      };
    }

    const rawBalances = await this.stellarService.getWalletBalances(
      user.walletPublicKey,
    );

    const balances = await Promise.all(
      rawBalances.map((balance) => this.mapWalletBalance(balance)),
    );

    const totalValueUSD = this.roundToTwo(
      balances.reduce((sum, balance) => sum + balance.valueUSD, 0),
    );
    const totalValueNGN = this.roundToTwo(
      balances.reduce((sum, balance) => sum + balance.valueNGN, 0),
    );

    const payload: Omit<WalletBalancesResponseDto, 'cached'> = {
      walletPublicKey: user.walletPublicKey,
      isFunded: rawBalances.length > 0,
      balances,
      totalValueUSD,
      totalValueNGN,
      fetchedAt: new Date().toISOString(),
    };

    this.walletBalancesCache.set(user.id, {
      payload,
      expiresAt: now + this.walletBalancesTtlMs,
    });

    return {
      ...payload,
      cached: false,
    };
  }

  async getWalletPortfolio(
    userId: string,
  ): Promise<WalletPortfolioResponseDto> {
    const balancesPayload = await this.getWalletBalances(userId);
    const total = balancesPayload.totalValueUSD;

    const holdings: PortfolioHoldingDto[] = balancesPayload.balances.map(
      (item) => ({
        asset: item.asset,
        balance: item.balance,
        assetIssuer: item.assetIssuer,
        valueUSD: item.valueUSD,
        valueNGN: item.valueNGN,
        percentageOfPortfolio:
          total > 0 ? this.roundToTwo((item.valueUSD / total) * 100) : 0,
      }),
    );

    return {
      walletPublicKey: balancesPayload.walletPublicKey,
      isFunded: balancesPayload.isFunded,
      totalPortfolioValueUSD: balancesPayload.totalValueUSD,
      totalPortfolioValueNGN: balancesPayload.totalValueNGN,
      holdings,
      fetchedAt: balancesPayload.fetchedAt,
      cached: balancesPayload.cached,
    };
  }

  async syncWalletBalanceSnapshots(): Promise<{
    processed: number;
    updated: number;
  }> {
    const users = await this.userRepository.find({
      select: ['id', 'walletPublicKey', 'balances'],
    });

    let updated = 0;

    for (const user of users) {
      try {
        const liveBalances = await this.stellarService.getWalletBalances(
          user.walletPublicKey,
        );
        const snapshot = this.toSnapshotBalances(liveBalances);
        await this.userRepository.update(user.id, { balances: snapshot });
        updated += 1;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to sync wallet balances for user ${user.id}: ${errorMessage}`,
        );
      }
    }

    return {
      processed: users.length,
      updated,
    };
  }

  private excludeSecrets(user: User): ProfileResponseDto {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, walletSecretKeyEncrypted, twoFactorSecret, ...profile } =
      user;
    return profile as ProfileResponseDto;
  }

  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updateData: Partial<User> = {};

    if (updateProfileDto.firstName !== undefined) {
      updateData.firstName = updateProfileDto.firstName.trim();
    }

    if (updateProfileDto.lastName !== undefined) {
      updateData.lastName = updateProfileDto.lastName.trim();
    }

    if (Object.keys(updateData).length > 0) {
      await this.userRepository.update(userId, updateData);
    }

    const updatedUser = await this.findById(userId);
    return this.excludeSecrets(updatedUser!);
  }

  async deleteProfile(userId: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.delete(userId);
  }

  private async mapWalletBalance(balance: WalletBalanceResult): Promise<{
    asset: string;
    balance: string;
    assetIssuer?: string;
    valueUSD: number;
    valueNGN: number;
  }> {
    const amount = parseFloat(balance.balance);
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        asset: balance.asset,
        balance: balance.balance,
        assetIssuer: balance.assetIssuer,
        valueUSD: 0,
        valueNGN: 0,
      };
    }

    const [usdRate, ngnRate] = await Promise.all([
      this.getSafeRate(balance.asset, 'USD'),
      this.getSafeRate(balance.asset, 'NGN'),
    ]);

    return {
      asset: balance.asset,
      balance: balance.balance,
      assetIssuer: balance.assetIssuer,
      valueUSD: this.roundToTwo(amount * usdRate),
      valueNGN: this.roundToTwo(amount * ngnRate),
    };
  }

  private async getSafeRate(from: string, to: string): Promise<number> {
    try {
      const rate = await this.exchangeRatesService.getRate(from, to);
      return rate.rate;
    } catch {
      return 0;
    }
  }

  private toSnapshotBalances(
    balances: WalletBalanceResult[],
  ): Record<string, number> {
    const snapshot: Record<string, number> = {};

    for (const balance of balances) {
      const parsedBalance = parseFloat(balance.balance);
      const safeBalance = Number.isFinite(parsedBalance) ? parsedBalance : 0;

      const key = balance.assetIssuer
        ? `${balance.asset}:${balance.assetIssuer}`
        : balance.asset;

      snapshot[key] = safeBalance;
    }

    return snapshot;
  }

  private roundToTwo(value: number): number {
    return Number(value.toFixed(2));
  }
}
