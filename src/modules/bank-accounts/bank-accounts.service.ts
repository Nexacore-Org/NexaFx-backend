import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LinkedBankAccount, BankProvider } from './entities/linked-bank-account.entity';

@Injectable()
export class BankAccountsService {
  private readonly logger = new Logger(BankAccountsService.name);

  constructor(
    @InjectRepository(LinkedBankAccount)
    private readonly accountRepo: Repository<LinkedBankAccount>,
  ) {}

  async initiateLink(
    userId: string,
    provider: BankProvider,
  ): Promise<{ linkUrl: string; reference: string }> {
    const reference = `nexafx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    // In production: call Mono/Okra OAuth URL generation
    const linkUrl =
      provider === BankProvider.MONO
        ? `https://connect.mono.co/connect/auth?reference=${reference}`
        : `https://api.okra.to/v2/connect/initialize?reference=${reference}`;

    // Would store reference in Redis with userId for callback lookup
    // await this.redisService.set(`bank_link:${reference}`, userId, 'EX', 600);

    return { linkUrl, reference };
  }

  async handleCallback(
    reference: string,
    code: string,
  ): Promise<LinkedBankAccount> {
    // In production: exchange code for access token, fetch account info from provider API
    // For now, stub the response
    this.logger.log(`Processing callback for reference=${reference}`);

    const account = this.accountRepo.create({
      userId: 'resolved-from-redis',
      provider: BankProvider.MONO,
      accountId: code,
      bankName: 'Stub Bank',
      accountName: 'Stub Account',
      accountNumber: '0000',
      currency: 'NGN',
      lastSyncedAt: new Date(),
      isActive: true,
    });

    // Would store encrypted access token in Redis with TTL
    // await this.redisService.set(`bank_token:${account.id}`, encryptedToken, 'EX', 2592000);

    return this.accountRepo.save(account);
  }

  async syncBalance(accountId: string): Promise<LinkedBankAccount> {
    const account = await this.accountRepo.findOne({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Linked account not found');

    // In production: retrieve token from Redis, call provider API for balance
    account.lastSyncedAt = new Date();
    return this.accountRepo.save(account);
  }

  async getUserAccounts(userId: string): Promise<LinkedBankAccount[]> {
    return this.accountRepo.find({
      where: { userId, isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async unlinkAccount(id: string, userId: string): Promise<LinkedBankAccount> {
    const account = await this.accountRepo.findOne({ where: { id, userId } });
    if (!account) throw new NotFoundException('Linked account not found');
    account.isActive = false;
    return this.accountRepo.save(account);
  }
}
