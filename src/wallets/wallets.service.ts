import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { WalletBalanceResult } from '../blockchain/stellar/stellar.types';
import { EncryptionService } from '../common/services/encryption.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { Wallet, StellarNetwork } from './entities/wallet.entity';
import { GenerateWalletDto, ImportWalletDto } from './dto/wallet.dto';

export interface TransactionWalletContext {
  publicKey: string;
  encryptedSecretKey: string | null;
}

export interface WalletListItem {
  id: string;
  publicKey: string;
  label: string;
  isDefault: boolean;
  network: StellarNetwork;
  createdAt: Date;
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
   * Used after signup / managed user creation when the User row already holds keys.
   * Skips if the user already has any wallet rows (e.g. post-migration).
   */
  async seedPrimaryWalletFromUserCredentials(
    userId: string,
    publicKey: string,
    encryptedSecretKey: string,
  ): Promise<void> {
    const count = await this.walletRepository.count({ where: { userId } });
    if (count > 0) {
      return;
    }

    await this.walletRepository.save(
      this.walletRepository.create({
        userId,
        publicKey,
        encryptedSecretKey,
        label: 'Primary',
        isDefault: true,
        network: this.getNetwork(),
      }),
    );
  }

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
      return {
        publicKey: wallet.publicKey,
        encryptedSecretKey: wallet.encryptedSecretKey,
      };
    }

    const defaultWallet = await this.walletRepository.findOne({
      where: { userId, isDefault: true },
    });
    if (defaultWallet) {
      return {
        publicKey: defaultWallet.publicKey,
        encryptedSecretKey: defaultWallet.encryptedSecretKey,
      };
    }

    const user = await this.usersService.findById(userId);
    if (!user?.walletPublicKey) {
      throw new BadRequestException('User does not have a Stellar wallet configured');
    }
    return {
      publicKey: user.walletPublicKey,
      encryptedSecretKey: user.walletSecretKeyEncrypted,
    };
  }

  async listWallets(userId: string): Promise<WalletListItem[]> {
    const wallets = await this.walletRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });

    const withBalances = await Promise.all(
      wallets.map(async (w) => {
        const balances = await this.stellarService.getWalletBalances(w.publicKey);
        return {
          id: w.id,
          publicKey: w.publicKey,
          label: w.label,
          isDefault: w.isDefault,
          network: w.network,
          createdAt: w.createdAt,
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
      dto?.label?.trim() ||
      `Wallet ${existing > 0 ? existing + 1 : 1}`;

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
    });
    const saved = await this.walletRepository.save(wallet);

    return {
      id: saved.id,
      publicKey: saved.publicKey,
      label: saved.label,
      isDefault: saved.isDefault,
      network: saved.network,
      createdAt: saved.createdAt,
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
      throw new BadRequestException('This wallet is already linked to your account');
    }

    const label = dto.label?.trim() || 'Imported (watch-only)';

    const wallet = this.walletRepository.create({
      userId,
      publicKey: normalized,
      encryptedSecretKey: null,
      label,
      isDefault: false,
      network: this.getNetwork(),
    });
    const saved = await this.walletRepository.save(wallet);

    return {
      id: saved.id,
      publicKey: saved.publicKey,
      label: saved.label,
      isDefault: saved.isDefault,
      network: saved.network,
      createdAt: saved.createdAt,
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
      publicKey: saved.publicKey,
      label: saved.label,
      isDefault: saved.isDefault,
      network: saved.network,
      createdAt: saved.createdAt,
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

      const userUpdate: Partial<User> = {
        walletPublicKey: target.publicKey,
      };
      if (target.encryptedSecretKey != null) {
        userUpdate.walletSecretKeyEncrypted = target.encryptedSecretKey;
      }
      await manager.getRepository(User).update(userId, userUpdate);
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
}
