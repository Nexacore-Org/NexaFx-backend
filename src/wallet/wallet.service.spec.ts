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
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly horizonService: HorizonService,
  ) {}

  async create(userId: string, createWalletDto: CreateWalletDto): Promise<Wallet> {
    const existingWallet = await this.walletRepository.findOne({ where: { userId } });
    if (existingWallet) {
      throw new ConflictException('User already has a wallet');
    }

    const wallet = this.walletRepository.create({ userId, ...createWalletDto });
    return this.walletRepository.save(wallet);
  }

  async findAll(userId: string): Promise<Wallet[]> {
    return this.walletRepository.find({ where: { userId } });
  }

  async findOne(id: string, userId: string): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({ where: { id, userId } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet;
  }

  async update(id: string, userId: string, updateWalletDto: UpdateWalletDto): Promise<Wallet> {
    const wallet = await this.findOne(id, userId);

    if (updateWalletDto.isPrimary) {
      await this.walletRepository.update({ userId, isPrimary: true }, { isPrimary: false });
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

  async getUserBalances(userId: string) {
    const wallets = await this.walletRepository.find({ where: { userId } });
    if (!wallets.length) return [];

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
    const wallet = await this.walletRepository.findOne({ where: { id: walletId } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    return wallet.status === 'frozen'; // assuming you have a 'status' column
  }

  /**
   * ✅ Used in middleware: Gets spendable balance from Stellar
   */
  async getBalance(walletId: string): Promise<number> {
    const wallet = await this.walletRepository.findOne({ where: { id: walletId } });
    if (!wallet || !wallet.stellarAddress) {
      throw new NotFoundException('Wallet or Stellar address not found');
    }

    const balances = await this.getWalletBalances(wallet.stellarAddress);
    const nativeBalance = balances.find((b: any) => b.asset_type === 'native');
    const spendable = nativeBalance ? parseFloat(nativeBalance.balance) - parseFloat(nativeBalance.locked || '0') : 0;
    return Math.max(spendable, 0);
  }
}
