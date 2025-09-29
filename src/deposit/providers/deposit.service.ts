import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import * as QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { User } from 'src/user/entities/user.entity';
import { Currency } from 'src/currencies/entities/currency.entity';
import { NotificationsService } from 'src/notifications/providers/notifications.service';
import { CreateDepositDto } from '../dto/create-deposit.dto';
import {
  DepositMethodsResponseDto,
  DepositResponseDto,
  WalletAddressResponseDto,
} from '../dto/deposit-response.dto';
import { DepositMethod } from '../enums/depositMethod.enum';
import { TransactionType } from 'src/transactions/enums/transaction-type.enum';
import { TransactionStatus } from 'src/transactions/enums/transaction-status.enum';
import { NotificationType } from 'src/notifications/enum/notificationType.enum';
import { NotificationChannel } from 'src/notifications/enum/notificationChannel.enum';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class DepositService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Currency)
    private readonly currencyRepository: Repository<Currency>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createDeposit(
    userId: string,
    createDepositDto: CreateDepositDto,
  ): Promise<DepositResponseDto> {
    const { currency, amount, method, reference, description, sourceAddress } =
      createDepositDto;

    // Validate amount
    if (amount <= 0) {
      throw new BadRequestException('Deposit amount must be greater than 0');
    }

    // Validate user exists
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validate currency exists
    const currencyEntity = await this.currencyRepository.findOne({
      where: { code: currency.toUpperCase() },
    });
    if (!currencyEntity) {
      throw new BadRequestException(`Currency ${currency} is not supported`);
    }

    // Generate unique reference
    const depositReference = this.generateDepositReference();

    // Generate destination address for crypto deposits
    let destinationAddress: string | undefined;
    let qrCodeData: string | undefined;

    if (method === DepositMethod.INSTANT) {
      destinationAddress = await this.generateCryptoAddress(currency);
      qrCodeData = await this.generateQRCode(destinationAddress);
    }

    // Calculate fees (currently 0% as per Figma)
    const feeAmount = 0;
    const totalAmount = amount + feeAmount;

    // Create deposit transaction
    const depositTransaction = this.transactionRepository.create({
      initiatorId: userId,
      asset: currency.toUpperCase(),
      type: TransactionType.DEPOSIT,
      amount,
      currencyId: currencyEntity.id,
      status: TransactionStatus.PENDING,
      reference: depositReference,
      description: description || `${method || 'INSTANT'} deposit`,
      sourceAccount: sourceAddress,
      destinationAccount: destinationAddress,
      totalAmount,
      feeAmount,
      metadata: {
        method: method || DepositMethod.INSTANT,
        originalReference: reference,
        qrCodeData,
        depositType: 'USER_INITIATED',
      },
    });

    const savedTransaction =
      await this.transactionRepository.save(depositTransaction);

    // Send notification
    try {
      await this.notificationsService.create({
        userId,
        title: 'Deposit Request Submitted',
        message: `Your deposit request of ${amount} ${currency} has been submitted and is awaiting confirmation.`,
        type: NotificationType.DEPOSIT_PENDING,
        channel: NotificationChannel.BOTH,
        metadata: {
          transactionId: savedTransaction.id,
          amount,
          currency,
          reference: depositReference,
        },
      });
    } catch (error) {
      console.error('Failed to send deposit notification:', error);
    }

    return this.mapToDepositResponse(
      savedTransaction,
      destinationAddress,
      qrCodeData,
    );
  }

  async getDepositMethods(): Promise<DepositMethodsResponseDto> {
    return {
      methods: [
        {
          type: DepositMethod.INSTANT,
          name: 'Instant Deposit',
          description:
            'Send crypto directly to your NexaFX wallet address. Just copy your address and make the transfer.',
          fee: '0%',
          enabled: true,
        },
        {
          type: DepositMethod.MOONPAY,
          name: 'Buy naira via exchange (moonPay etc)',
          description: 'Buy crypto instantly through MoonPay.',
          fee: '0%',
          enabled: true,
        },
        {
          type: DepositMethod.DIRECT_TOPUP,
          name: 'Direct top-up',
          description:
            'Top up your wallet directly using your mobile wallet or bank-linked options like Google pay etc',
          fee: '0%',
          enabled: true,
        },
      ],
    };
  }

  async generateWalletAddress(
    userId: string,
    currency: string,
  ): Promise<WalletAddressResponseDto> {
    // Validate currency
    const currencyEntity = await this.currencyRepository.findOne({
      where: { code: currency.toUpperCase() },
    });
    if (!currencyEntity) {
      throw new BadRequestException(`Currency ${currency} is not supported`);
    }

    // Generate address based on currency
    const address = await this.generateCryptoAddress(currency);
    const qrCode = await this.generateQRCode(address);

    return {
      address,
      qrCode,
      currency: currency.toUpperCase(),
      network: this.getNetworkForCurrency(currency),
    };
  }

  async getDepositHistory(
    userId: string,
    filters: {
      page: number;
      limit: number;
      status?: string;
      currency?: string;
    },
  ) {
    const { page, limit, status, currency } = filters;
    const skip = (page - 1) * limit;

    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.currency', 'currency')
      .where('transaction.initiatorId = :userId', { userId })
      .andWhere('transaction.type = :type', { type: TransactionType.DEPOSIT });

    if (status) {
      queryBuilder.andWhere('transaction.status = :status', {
        status: status.toUpperCase(),
      });
    }

    if (currency) {
      queryBuilder.andWhere('transaction.asset = :currency', {
        currency: currency.toUpperCase(),
      });
    }

    const [transactions, total] = await queryBuilder
      .orderBy('transaction.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const deposits = transactions.map((transaction) =>
      this.mapToDepositResponse(
        transaction,
        transaction.destinationAccount,
        transaction.metadata?.qrCodeData,
      ),
    );

    return {
      deposits,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getDepositById(
    id: string,
    userId: string,
  ): Promise<DepositResponseDto> {
    const transaction = await this.transactionRepository.findOne({
      where: {
        id,
        initiatorId: userId,
        type: TransactionType.DEPOSIT,
      },
      relations: ['currency'],
    });

    if (!transaction) {
      throw new NotFoundException('Deposit not found');
    }

    return this.mapToDepositResponse(
      transaction,
      transaction.destinationAccount,
      transaction.metadata?.qrCodeData,
    );
  }

  async confirmDeposit(
    id: string,
    userId: string,
  ): Promise<DepositResponseDto> {
    const transaction = await this.transactionRepository.findOne({
      where: {
        id,
        initiatorId: userId,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
      },
      relations: ['currency'],
    });

    if (!transaction) {
      throw new NotFoundException('Pending deposit not found');
    }

    // Update transaction status
    transaction.status = TransactionStatus.COMPLETED;
    transaction.completionDate = new Date();
    transaction.processingDate = new Date();

    const updatedTransaction =
      await this.transactionRepository.save(transaction);

    // Send success notification
    try {
      await this.notificationsService.create({
        userId,
        title: 'Deposit Confirmation',
        message: `Your deposit of ${transaction.amount} ${transaction.asset} received successfully.`,
        type: NotificationType.DEPOSIT_CONFIRMED,
        channel: NotificationChannel.BOTH,
        metadata: {
          transactionId: transaction.id,
          amount: transaction.amount,
          currency: transaction.asset,
          reference: transaction.reference,
        },
      });
    } catch (error) {
      console.error('Failed to send deposit confirmation notification:', error);
    }

    return this.mapToDepositResponse(
      updatedTransaction,
      updatedTransaction.destinationAccount,
      updatedTransaction.metadata?.qrCodeData,
    );
  }

  private generateDepositReference(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();
    return `DEP-${date}-${randomSuffix}`;
  }

  private async generateCryptoAddress(currency: string): Promise<string> {
    // This is a mock implementation. In production, you would integrate with
    // actual blockchain services to generate real addresses
    const mockAddresses = {
      USDC: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
      BTC: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
      ETH: '0x742d35Cc6634C0532925a3b8D4C9db96590c6C87',
      NGN: 'NGN-WALLET-' + uuidv4().substring(0, 8),
    };

    return (
      mockAddresses[currency.toUpperCase()] ||
      `${currency.toUpperCase()}-${uuidv4()}`
    );
  }

  private async generateQRCode(data: string): Promise<string> {
    try {
      return await QRCode.toDataURL(data, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      throw new InternalServerErrorException('Failed to generate QR code');
    }
  }

  private getNetworkForCurrency(currency: string): string {
    const networks = {
      USDC: 'Ethereum',
      BTC: 'Bitcoin',
      ETH: 'Ethereum',
      NGN: 'Fiat',
    };

    return networks[currency.toUpperCase()] || 'Unknown';
  }

  private mapToDepositResponse(
    transaction: Transaction,
    destinationAddress?: string,
    qrCodeData?: string,
  ): DepositResponseDto {
    return {
      id: transaction.id,
      userId: transaction.initiatorId,
      currency: transaction.asset,
      amount: transaction.amount,
      method: transaction.metadata?.method || DepositMethod.INSTANT,
      status: transaction.status,
      reference: transaction.reference,
      destinationAddress,
      qrCodeData,
      feeAmount: transaction.feeAmount || 0,
      totalAmount: transaction.totalAmount || transaction.amount,
      metadata: transaction.metadata,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    };
  }
}
