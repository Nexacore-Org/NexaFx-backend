import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StellarService } from '../blockchain/stellar/stellar.service';
import { EncryptionService } from '../common/services/encryption.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';
import { Escrow, EscrowStatus } from './entities/escrow.entity';
import { CreateEscrowDto } from './dto/create-escrow.dto';
import { AdminResolveEscrowDto } from './dto/admin-resolve-escrow.dto';
import { EscrowQueryDto } from './dto/escrow-query.dto';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    @InjectRepository(Escrow)
    private readonly escrowRepository: Repository<Escrow>,
    private readonly usersService: UsersService,
    private readonly walletsService: WalletsService,
    private readonly stellarService: StellarService,
    private readonly encryptionService: EncryptionService,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  async createEscrow(
    userId: string,
    dto: CreateEscrowDto,
  ): Promise<Escrow> {
    const recipient = await this.usersService.findByEmail(dto.recipientEmail);
    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    const escrow = this.escrowRepository.create({
      senderId: userId,
      recipientId: recipient.id,
      amount: dto.amount.toFixed(8),
      currency: dto.currency,
      title: dto.title,
      description: dto.description,
      releaseCondition: dto.releaseCondition,
      autoReleaseAt: dto.autoReleaseAt ? new Date(dto.autoReleaseAt) : null,
      disputeWindowHours: dto.disputeWindowHours ?? 24,
      status: EscrowStatus.PENDING,
    });

    const saved = await this.escrowRepository.save(escrow);

    await this.sendStatusNotification(saved, 'Escrow agreement created');
    return saved;
  }

  async fundEscrow(userId: string, escrowId: string): Promise<Escrow> {
    return this.dataSource.transaction(async (manager) => {
      const escrow = await manager.findOne(Escrow, {
        where: { id: escrowId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!escrow) {
        throw new NotFoundException('Escrow not found');
      }
      if (escrow.senderId !== userId) {
        throw new ForbiddenException('Only sender can fund escrow');
      }
      if (escrow.status !== EscrowStatus.PENDING) {
        throw new BadRequestException('Escrow is not pending funding');
      }

      const sender = await this.usersService.findById(userId);
      if (!sender) {
        throw new NotFoundException('Sender not found');
      }

      const currentBalance = parseFloat(sender.balances?.[escrow.currency]?.toString() ?? '0');
      const amount = parseFloat(escrow.amount);
      if (currentBalance < amount) {
        throw new BadRequestException('Insufficient balance');
      }

      await this.usersService.updateByUserId(userId, {
        balances: {
          ...sender.balances,
          [escrow.currency]: currentBalance - amount,
        },
      });

      const keypair = await this.stellarService.generateWallet(userId, {
        source: 'escrow.fund',
      });
      const encrypted = this.encryptionService.encrypt(keypair.secretKey);

      const signerSecret = await this.walletsService.resolveWalletForTransaction(
        userId,
      );
      if (!signerSecret.encryptedSecretKey) {
        throw new BadRequestException('Sender wallet cannot sign transactions');
      }

      const secretKey = this.encryptionService.decrypt(
        signerSecret.encryptedSecretKey,
      );

      const result = await this.stellarService.sendPayment({
        sourcePublicKey: await this.getUserSourcePublicKey(userId),
        destination: keypair.publicKey,
        asset: 'XLM',
        amount: escrow.amount,
        secretKey,
        memo: `ESCROW-FUND-${escrow.id}`,
        userId,
      });

      escrow.status = EscrowStatus.FUNDED;
      escrow.stellarEscrowPublicKey = keypair.publicKey;
      escrow.stellarEscrowSecretEncrypted = encrypted;
      escrow.fundedTxHash = result.hash;
      escrow.fundedAt = new Date();

      const saved = await manager.save(escrow);
      await this.sendStatusNotification(saved, 'Escrow funded');
      return saved;
    });
  }

  private async getUserSourcePublicKey(userId: string): Promise<string> {
    const ctx = await this.walletsService.resolveWalletForTransaction(userId);
    return ctx.publicKey;
  }

  private async getEscrowSecret(escrow: Escrow): Promise<string> {
    if (!escrow.stellarEscrowSecretEncrypted) {
      throw new BadRequestException('Escrow secret not found');
    }
    return this.encryptionService.decrypt(escrow.stellarEscrowSecretEncrypted);
  }

  async releaseEscrow(
    userId: string,
    escrowId: string,
    force = false,
  ): Promise<Escrow> {
    return this.dataSource.transaction(async (manager) => {
      const escrow = await manager.findOne(Escrow, {
        where: { id: escrowId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!escrow) {
        throw new NotFoundException('Escrow not found');
      }
      if (escrow.senderId !== userId) {
        throw new ForbiddenException('Only sender can release escrow');
      }
      if (
        escrow.status !== EscrowStatus.FUNDED &&
        !(force && escrow.status === EscrowStatus.DISPUTED)
      ) {
        throw new BadRequestException('Escrow is not funded');
      }

      const recipient = await this.usersService.findById(escrow.recipientId);
      if (!recipient) {
        throw new NotFoundException('Recipient not found');
      }

      const escrowSecret = await this.getEscrowSecret(escrow);
      const receiverPublicKey = await this.getUserSourcePublicKey(recipient.id);

      const result = await this.stellarService.sendPayment({
        sourcePublicKey: escrow.stellarEscrowPublicKey!,
        destination: receiverPublicKey,
        asset: 'XLM',
        amount: escrow.amount,
        secretKey: escrowSecret,
        memo: `ESCROW-RELEASE-${escrow.id}`,
        userId: escrow.senderId,
      });

      escrow.status = EscrowStatus.RELEASED;
      escrow.releaseTxHash = result.hash;
      escrow.releasedAt = new Date();

      await manager.save(escrow);
      await this.updateUserBalance(recipient.id, escrow.currency, parseFloat(escrow.amount));
      await this.sendStatusNotification(escrow, 'Escrow released');
      return escrow;
    });
  }

  async refundEscrow(userId: string, escrowId: string): Promise<Escrow> {
    return this.dataSource.transaction(async (manager) => {
      const escrow = await manager.findOne(Escrow, {
        where: { id: escrowId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!escrow) {
        throw new NotFoundException('Escrow not found');
      }
      if (escrow.status !== EscrowStatus.FUNDED && escrow.status !== EscrowStatus.DISPUTED) {
        throw new BadRequestException('Escrow cannot be refunded');
      }
      if (escrow.senderId !== userId && escrow.recipientId !== userId) {
        throw new ForbiddenException('Only sender, recipient, or admin can refund escrow');
      }

      const escrowSecret = await this.getEscrowSecret(escrow);
      const senderPublicKey = await this.getUserSourcePublicKey(escrow.senderId);

      const result = await this.stellarService.sendPayment({
        sourcePublicKey: escrow.stellarEscrowPublicKey!,
        destination: senderPublicKey,
        asset: 'XLM',
        amount: escrow.amount,
        secretKey: escrowSecret,
        memo: `ESCROW-REFUND-${escrow.id}`,
        userId: escrow.senderId,
      });

      escrow.status = EscrowStatus.REFUNDED;
      escrow.refundTxHash = result.hash;

      await manager.save(escrow);
      await this.updateUserBalance(escrow.senderId, escrow.currency, parseFloat(escrow.amount));
      await this.sendStatusNotification(escrow, 'Escrow refunded');
      return escrow;
    });
  }

  async disputeEscrow(userId: string, escrowId: string): Promise<Escrow> {
    const escrow = await this.escrowRepository.findOne({ where: { id: escrowId } });
    if (!escrow) {
      throw new NotFoundException('Escrow not found');
    }
    if (escrow.status !== EscrowStatus.FUNDED) {
      throw new BadRequestException('Only funded escrow can be disputed');
    }
    if (escrow.senderId !== userId && escrow.recipientId !== userId) {
      throw new ForbiddenException('Only sender or recipient can dispute escrow');
    }

    escrow.status = EscrowStatus.DISPUTED;
    const saved = await this.escrowRepository.save(escrow);
    await this.sendStatusNotification(saved, 'Escrow disputed');
    return saved;
  }

  async findUserEscrows(userId: string, query: EscrowQueryDto): Promise<Escrow[]> {
    const where: any = [{ senderId: userId }, { recipientId: userId }];
    if (query.status) {
      return this.escrowRepository.find({
        where: [{ senderId: userId, status: query.status }, { recipientId: userId, status: query.status }],
        order: { createdAt: 'DESC' },
      });
    }
    return this.escrowRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(userId: string, escrowId: string): Promise<Escrow> {
    const escrow = await this.escrowRepository.findOne({ where: { id: escrowId } });
    if (!escrow) {
      throw new NotFoundException('Escrow not found');
    }
    if (escrow.senderId !== userId && escrow.recipientId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return escrow;
  }

  async findAll(query: EscrowQueryDto): Promise<Escrow[]> {
    const where: any = {};
    if (query.status) {
      where.status = query.status;
    }
    return this.escrowRepository.find({ where, order: { createdAt: 'DESC' } });
  }

  async resolveEscrow(id: string, dto: AdminResolveEscrowDto): Promise<Escrow> {
    const escrow = await this.escrowRepository.findOne({ where: { id } });
    if (!escrow) {
      throw new NotFoundException('Escrow not found');
    }
    if (dto.outcome === 'release') {
      return this.releaseEscrow(escrow.senderId, id, true);
    }
    return this.refundEscrow(escrow.senderId, id);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async autoReleaseDueEscrows(): Promise<void> {
    const escrows = await this.escrowRepository
      .createQueryBuilder('escrow')
      .where('escrow.status = :status', { status: EscrowStatus.FUNDED })
      .andWhere('escrow.autoReleaseAt IS NOT NULL')
      .andWhere('escrow.autoReleaseAt < :now', { now: new Date() })
      .getMany();

    for (const escrow of escrows) {
      if (escrow.status !== EscrowStatus.FUNDED) {
        continue;
      }
      try {
        await this.releaseEscrow(escrow.senderId, escrow.id);
      } catch (error) {
        this.logger.warn(`Failed to auto-release escrow ${escrow.id}: ${error}`);
      }
    }
  }

  private async sendStatusNotification(escrow: Escrow, message: string): Promise<void> {
    const metadata = { escrowId: escrow.id, status: escrow.status };
    await Promise.all([
      this.notificationsService.create({
        userId: escrow.senderId,
        type: 1 as any,
        title: 'Escrow Update',
        message,
        metadata,
        relatedId: escrow.id,
      }),
      this.notificationsService.create({
        userId: escrow.recipientId,
        type: 1 as any,
        title: 'Escrow Update',
        message,
        metadata,
        relatedId: escrow.id,
      }),
    ]).catch((err) => this.logger.warn('Notification send failed', err));
  }

  private async updateUserBalance(userId: string, currency: string, amount: number): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.balances ??= {};
    const currentBalance = parseFloat(user.balances[currency]?.toString() ?? '0');
    user.balances[currency] = currentBalance + amount;
    await this.usersService.updateByUserId(userId, { balances: user.balances });
  }
}
