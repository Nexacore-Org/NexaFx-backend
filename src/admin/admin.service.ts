import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { Currency } from '../currencies/entities/currency.entity';
import { FundWalletDto } from './dto/fund-wallet.dto';
import { AuditService } from '../audit/audit.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdateAdminDto } from './dto/update-admin.dto';
import { Wallet } from '../wallet/entities/wallet.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly auditService: AuditService,
  ) {}

  async create(createAdminDto: CreateAdminDto) {
    return 'This action adds a new admin';
  }

  async findAll() {
    return 'This action returns all admin';
  }

  async findOne(id: number) {
    return `This action returns a #${id} admin`;
  }

  async update(id: number, updateAdminDto: UpdateAdminDto) {
    return `This action updates a #${id} admin`;
  }

  async remove(id: number) {
    return `This action removes a #${id} admin`;
  }

  async fundUserWallet(adminId: string, fundWalletDto: FundWalletDto) {
    const { userId, amount, currencyCode, reason } = fundWalletDto;

    // Find user and currency
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

    // Find or create wallet
    let wallet = await this.walletRepository.findOne({
      where: { user: { id: userId }, currencyCode },
      relations: ['user', 'currency'],
    });

    if (!wallet) {
      wallet = this.walletRepository.create({
        user,
        currency,
        currencyCode,
        balance: 0,
      });
    }

    // Update balance
    wallet.balance += amount;
    await this.walletRepository.save(wallet);

    // Create audit log
    await this.auditService.create({
      userId: adminId,
      action: 'FUND_WALLET',
      details: {
        targetUserId: userId,
        amount,
        currencyCode,
        reason,
        newBalance: wallet.balance,
      },
    });

    return {
      message: 'Wallet funded successfully',
      newBalance: wallet.balance,
    };
  }
}
