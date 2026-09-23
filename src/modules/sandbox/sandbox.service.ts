import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SandboxAccount } from './entities/sandbox-account.entity';
import { SandboxEvent } from './entities/sandbox-event.entity';
import { SandboxRequestLog } from './entities/sandbox-request-log.entity';
import { UsersService } from '../../users/users.service';
import { WalletsService } from '../../wallets/wallets.service';
import { RedisService } from '../redis/redis.service';
import { randomBytes } from 'crypto';

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);

  constructor(
    @InjectRepository(SandboxAccount)
    private readonly sandboxAccountRepo: Repository<SandboxAccount>,
    @InjectRepository(SandboxEvent)
    private readonly sandboxEventRepo: Repository<SandboxEvent>,
    @InjectRepository(SandboxRequestLog)
    private readonly sandboxRequestLogRepo: Repository<SandboxRequestLog>,
    private readonly usersService: UsersService,
    private readonly walletsService: WalletsService,
    private readonly redisService: RedisService,
  ) {}

  async register(userId: string): Promise<{ apiKey: string }> {
    const existing = await this.sandboxAccountRepo.findOne({
      where: { userId },
    });
    if (existing) {
      throw new BadRequestException(
        'Sandbox account already exists for this user',
      );
    }

    const apiKey = 'nxa_test_' + randomBytes(24).toString('hex');

    const sandboxAccount = this.sandboxAccountRepo.create({
      userId,
      sandboxApiKey: apiKey,
      resetCount: 0,
    });
    const savedAccount = await this.sandboxAccountRepo.save(sandboxAccount);

    await this.seedSandboxData(savedAccount.id, userId);

    this.logger.log(`Sandbox account created for user ${userId}`);
    return { apiKey };
  }

  async reset(userId: string): Promise<SandboxAccount> {
    const account = await this.sandboxAccountRepo.findOne({
      where: { userId },
    });
    if (!account) {
      throw new NotFoundException('Sandbox account not found');
    }

    await this.sandboxEventRepo.delete({ sandboxAccountId: account.id });
    await this.sandboxRequestLogRepo.delete({ sandboxAccountId: account.id });
    await this.walletsService.deleteByUserId(userId);
    await this.redisService.deleteByPattern(`sandbox:${account.id}:*`);

    account.resetCount = account.resetCount + 1;
    const savedAccount = await this.sandboxAccountRepo.save(account);

    await this.seedSandboxData(savedAccount.id, userId);

    this.logger.log(
      `Sandbox reset for user ${userId}, reset count: ${savedAccount.resetCount}`,
    );
    return savedAccount;
  }

  async findByUserId(userId: string): Promise<SandboxAccount | null> {
    return this.sandboxAccountRepo.findOne({ where: { userId } });
  }

  async getEvents(sandboxAccountId: string): Promise<SandboxEvent[]> {
    return this.sandboxEventRepo.find({
      where: { sandboxAccountId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async triggerEvent(
    sandboxAccountId: string,
    eventType: string,
    data: any,
  ): Promise<SandboxEvent> {
    const event = this.sandboxEventRepo.create({
      sandboxAccountId,
      eventType,
      data,
    });
    return this.sandboxEventRepo.save(event);
  }

  async getRequestLog(sandboxAccountId: string): Promise<SandboxRequestLog[]> {
    return this.sandboxRequestLogRepo.find({
      where: { sandboxAccountId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async logRequest(
    sandboxAccountId: string,
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
  ): Promise<SandboxRequestLog> {
    const log = this.sandboxRequestLogRepo.create({
      sandboxAccountId,
      method,
      path,
      statusCode,
      durationMs,
    });
    const savedLog = await this.sandboxRequestLogRepo.save(log);

    const count = await this.sandboxRequestLogRepo.count({
      where: { sandboxAccountId },
    });
    if (count > 100) {
      const excess = count - 100;
      const oldLogs = await this.sandboxRequestLogRepo.find({
        where: { sandboxAccountId },
        order: { createdAt: 'ASC' },
        take: excess,
      });
      if (oldLogs.length > 0) {
        await this.sandboxRequestLogRepo.remove(oldLogs);
      }
    }

    return savedLog;
  }

  private async seedSandboxData(
    sandboxAccountId: string,
    userId: string,
  ): Promise<void> {
    await this.walletsService.create(userId, 'XLM', '10000.00000000');

    const sampleTransactions = [
      {
        userId,
        type: 'DEPOSIT',
        currency: 'XLM',
        amount: '5000.00000000',
        status: 'COMPLETED',
      },
      {
        userId,
        type: 'TRANSFER',
        currency: 'XLM',
        amount: '250.00000000',
        status: 'COMPLETED',
      },
      {
        userId,
        type: 'WITHDRAWAL',
        currency: 'XLM',
        amount: '100.00000000',
        status: 'COMPLETED',
      },
    ];

    for (const tx of sampleTransactions) {
      await this.triggerEvent(sandboxAccountId, 'TRANSACTION_CREATED', tx);
    }
  }
}
