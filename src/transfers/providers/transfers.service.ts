import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ScheduledTransfer,
  ScheduledTransferStatus,
} from '../entities/scheduled-transfer.entity';
import { TransactionsService } from 'src/transactions/transactions.service';
import { CurrenciesService } from 'src/currencies/currencies.service';
import { FeeService } from 'src/fees/fee.service';
import { UserService } from 'src/user/providers/user.service';
import { CreateScheduledTransferDto } from '../dto/create-scheduled-transfer.dto';
import { UpdateScheduledTransferDto } from '../dto/update-scheduled-transfer.dto';
import { TransactionType } from 'src/transactions/enums/transaction-type.enum';
import { WalletService } from '../../wallet/wallet.service';

@Injectable()
export class ScheduledTransfersService {
  private readonly logger = new Logger(ScheduledTransfersService.name);

  constructor(
    @InjectRepository(ScheduledTransfer)
    private readonly scheduledTransferRepository: Repository<ScheduledTransfer>,
    private readonly transactionsService: TransactionsService,
    private readonly currenciesService: CurrenciesService,
    private readonly feeService: FeeService,
    private readonly userService: UserService,
    private readonly eventEmitter: EventEmitter2,
    private readonly walletService: WalletService, // Add wallet service
  ) {}

  async getTodayTotal(userId: string): Promise<number> {
    const today = new Date();
    const start = new Date(today.setHours(0, 0, 0, 0));
    const end = new Date(today.setHours(23, 59, 59, 999));

    const transfers = await this.scheduledTransferRepository.find({
      where: {
        userId,
        createdAt: Between(start, end),
      },
    });

    return transfers.reduce((sum, tx) => sum + tx.amount, 0);
  }

  /**
   * Create a new scheduled transfer
   */
  async create(
    userId: string,
    createDto: CreateScheduledTransferDto,
  ): Promise<ScheduledTransfer> {
    // Validate currencies exist and auto-create wallets
    const [fromCurrency, toCurrency, user] = await Promise.all([
      this.currenciesService.findOne(createDto.fromCurrencyId),
      this.currenciesService.findOne(createDto.toCurrencyId),
      this.userService.findOne(userId),
    ]);

    // Auto-create wallets for both currencies
    await Promise.all([
      this.walletService.getOrCreateWalletForTransfer(
        userId,
        fromCurrency.code,
      ),
      this.walletService.getOrCreateWalletForTransfer(userId, toCurrency.code),
    ]);

    // Validate scheduled date is in the future
    const now = new Date();
    if (new Date(createDto.scheduledAt) <= now) {
      throw new BadRequestException('Scheduled date must be in the future');
    }

    // Create the scheduled transfer
    const scheduledTransfer = this.scheduledTransferRepository.create({
      userId,
      fromCurrencyId: createDto.fromCurrencyId,
      toCurrencyId: createDto.toCurrencyId,
      amount: createDto.amount,
      scheduledAt: createDto.scheduledAt,
      destinationAddress: createDto.destinationAddress,
      reference:
        createDto.reference || `SCH-${Date.now()}-${userId.substring(0, 8)}`,
      metadata: createDto.metadata || {},
      status: ScheduledTransferStatus.PENDING,
    });

    // Calculate estimated fees and add to metadata
    try {
      const { feeAmount, feePercent } = await this.feeService.calculateFee({
        userAccountType: user.accountType,
        transactionType: TransactionType.TRANSFER,
        amount: createDto.amount,
        currencyId: createDto.fromCurrencyId,
      });

      scheduledTransfer.metadata = {
        ...scheduledTransfer.metadata,
        estimatedFee: feeAmount,
        feePercent,
        estimatedTotal: createDto.amount + feeAmount,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to calculate fees for scheduled transfer: ${error.message}`,
      );
    }

    const savedTransfer =
      await this.scheduledTransferRepository.save(scheduledTransfer);

    this.logger.log(
      `Created scheduled transfer ${savedTransfer.id} for user ${userId}`,
    );

    return savedTransfer;
  }

  findAll() {
    // Implement your logic here, for example:
    return []; // or fetch from database
  }

  /**
   * Find all scheduled transfers for a user
   */
  async findAllForUser(userId: string): Promise<ScheduledTransfer[]> {
    return this.scheduledTransferRepository.find({
      where: { userId },
      order: { scheduledAt: 'ASC' },
    });
  }

  /**
   * Find a specific scheduled transfer by ID
   */
  async findOne(id: string, userId?: string): Promise<ScheduledTransfer> {
    const transfer = await this.scheduledTransferRepository.findOne({
      where: { id },
    });

    if (!transfer) {
      throw new NotFoundException(`Scheduled transfer with ID ${id} not found`);
    }

    // If userId is provided, verify ownership
    if (userId && transfer.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this scheduled transfer',
      );
    }

    return transfer;
  }

  /**
   * Update a scheduled transfer
   */
  async update(
    id: string,
    userId: string,
    updateDto: UpdateScheduledTransferDto,
  ): Promise<ScheduledTransfer> {
    const transfer = await this.findOne(id, userId);

    // Prevent updates to executed or cancelled transfers
    if (
      transfer.status === ScheduledTransferStatus.EXECUTED ||
      transfer.status === ScheduledTransferStatus.CANCELLED
    ) {
      throw new ConflictException(
        `Cannot update a transfer that has been ${transfer.status.toLowerCase()}`,
      );
    }

    // If updating status to CANCELLED, handle cancellation
    if (updateDto.status === ScheduledTransferStatus.CANCELLED) {
      return this.cancelTransfer(transfer);
    }

    // Validate scheduled date is in the future if provided
    if (
      updateDto.scheduledAt &&
      new Date(updateDto.scheduledAt) <= new Date()
    ) {
      throw new BadRequestException('Scheduled date must be in the future');
    }

    // If changing destination currency, validate it exists
    if (updateDto.toCurrencyId) {
      await this.currenciesService.findOne(updateDto.toCurrencyId);
    }

    // Update the transfer
    Object.assign(transfer, updateDto);

    // Recalculate fees if amount changed
    if (updateDto.amount) {
      const user = await this.userService.findOne(userId);
      const { feeAmount, feePercent } = await this.feeService.calculateFee({
        userAccountType: user.accountType,
        transactionType: TransactionType.TRANSFER,
        amount: updateDto.amount,
        currencyId: transfer.fromCurrencyId,
      });

      transfer.metadata = {
        ...transfer.metadata,
        estimatedFee: feeAmount,
        feePercent,
        estimatedTotal: updateDto.amount + feeAmount,
      };
    }

    return this.scheduledTransferRepository.save(transfer);
  }

  /**
   * Cancel a scheduled transfer
   */
  async cancelTransfer(
    transfer: ScheduledTransfer,
  ): Promise<ScheduledTransfer> {
    if (transfer.status !== ScheduledTransferStatus.PENDING) {
      throw new ConflictException(
        `Cannot cancel a transfer that is already ${transfer.status.toLowerCase()}`,
      );
    }

    transfer.status = ScheduledTransferStatus.CANCELLED;
    return this.scheduledTransferRepository.save(transfer);
  }

  /**
   * Delete a scheduled transfer
   */
  async remove(id: string, userId: string): Promise<void> {
    const transfer = await this.findOne(id, userId);

    if (transfer.status !== ScheduledTransferStatus.PENDING) {
      throw new ConflictException(
        `Cannot delete a transfer that has been ${transfer.status.toLowerCase()}`,
      );
    }

    await this.scheduledTransferRepository.remove(transfer);
  }

  /**
   * Execute a scheduled transfer
   */
  async executeTransfer(
    transfer: ScheduledTransfer,
  ): Promise<ScheduledTransfer> {
    try {
      // Create the actual transaction
      const transaction = await this.transactionsService.createTransaction({
        initiatorId: transfer.userId,
        currencyId: transfer.fromCurrencyId,
        amount: transfer.amount,
        type: TransactionType.TRANSFER,
        description: `Scheduled transfer: ${transfer.reference || transfer.id}`,
        reference: `SCH-${transfer.id}`,
        sourceAccount: undefined,
        destinationAccount: transfer.destinationAddress,
        metadata: {
          scheduledTransferId: transfer.id,
          originalScheduledDate: transfer.scheduledAt,
          ...transfer.metadata,
        },
      });

      // Update the scheduled transfer
      transfer.status = ScheduledTransferStatus.EXECUTED;
      transfer.executedAt = new Date();
      transfer.transactionId = transaction.id;

      this.logger.log(
        `Successfully executed scheduled transfer ${transfer.id} as transaction ${transaction.id}`,
      );

      // Emit event for notification
      this.eventEmitter.emit('scheduled-transfer.executed', {
        transferId: transfer.id,
        userId: transfer.userId,
        amount: transfer.amount,
        fromCurrency: transfer.fromCurrency.code,
        toCurrency: transfer.toCurrency.code,
        transactionId: transaction.id,
      });

      return this.scheduledTransferRepository.save(transfer);
    } catch (error) {
      // Handle execution failure
      transfer.status = ScheduledTransferStatus.FAILED;
      transfer.failureReason =
        error.message || 'Unknown error during execution';

      this.logger.error(
        `Failed to execute scheduled transfer ${transfer.id}: ${transfer.failureReason}`,
        error.stack,
      );

      // Emit event for notification
      this.eventEmitter.emit('scheduled-transfer.failed', {
        transferId: transfer.id,
        userId: transfer.userId,
        amount: transfer.amount,
        fromCurrency: transfer.fromCurrency.code,
        toCurrency: transfer.toCurrency.code,
        reason: transfer.failureReason,
      });

      return this.scheduledTransferRepository.save(transfer);
    }
  }

  /**
   * Cron job to process scheduled transfers
   * Runs every minute to check for transfers that need to be executed
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledTransfers() {
    this.logger.debug('Checking for scheduled transfers to execute...');

    try {
      // Find transfers that are due for execution
      const now = new Date();
      const pendingTransfers = await this.scheduledTransferRepository.find({
        where: {
          status: ScheduledTransferStatus.PENDING,
          scheduledAt: LessThanOrEqual(now),
        },
        relations: ['fromCurrency', 'toCurrency'],
      });

      if (pendingTransfers.length === 0) {
        return;
      }

      this.logger.log(
        `Found ${pendingTransfers.length} scheduled transfers to execute`,
      );

      // Process each transfer
      for (const transfer of pendingTransfers) {
        try {
          await this.executeTransfer(transfer);
        } catch (error) {
          this.logger.error(
            `Error executing scheduled transfer ${transfer.id}: ${error.message}`,
            error.stack,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Error processing scheduled transfers: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Get statistics about scheduled transfers
   */
  async getStats(userId?: string) {
    const queryBuilder =
      this.scheduledTransferRepository.createQueryBuilder('transfer');

    if (userId) {
      queryBuilder.where('transfer.userId = :userId', { userId });
    }

    const stats = await queryBuilder
      .select('transfer.status', 'status')
      .addSelect('COUNT(transfer.id)', 'count')
      .groupBy('transfer.status')
      .getRawMany();

    const result = {
      total: 0,
      pending: 0,
      executed: 0,
      cancelled: 0,
      failed: 0,
    };

    stats.forEach((stat) => {
      result[stat.status.toLowerCase()] = Number.parseInt(stat.count, 10);
      result.total += Number.parseInt(stat.count, 10);
    });

    return result;
  }

  /**
   * Manually trigger execution of a scheduled transfer before its scheduled time
   */
  async executeNow(id: string, userId: string): Promise<ScheduledTransfer> {
    const transfer = await this.findOne(id, userId);

    if (transfer.status !== ScheduledTransferStatus.PENDING) {
      throw new ConflictException(
        `Cannot execute a transfer that is already ${transfer.status.toLowerCase()}`,
      );
    }

    return this.executeTransfer(transfer);
  }

  /**
   * Cancel a scheduled transfer by txnId and userId
   */
  async cancelScheduledTransfer(txnId: string, userId: string, reason?: string): Promise<ScheduledTransfer> {
    const transfer = await this.findOne(txnId, userId);
    if (transfer.status !== ScheduledTransferStatus.PENDING) {
      throw new ConflictException(`Cannot cancel a transfer that is already ${transfer.status.toLowerCase()}`);
    }
    transfer.status = ScheduledTransferStatus.CANCELLED;
    if (reason) {
      transfer.failureReason = reason;
    }
    return this.scheduledTransferRepository.save(transfer);
  }
}

