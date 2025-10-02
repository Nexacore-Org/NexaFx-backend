import {
  Injectable,
  BadRequestException,
  UnprocessableEntityException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { CurrenciesService } from 'src/currencies/currencies.service';
import { Currency } from 'src/currencies/entities/currency.entity';
import { NotificationsService } from 'src/notifications/providers/notifications.service';
import { Transaction } from 'src/transactions/entities/transaction.entity';
import { User } from 'src/user/entities/user.entity';
import { Repository } from 'typeorm';
import {
  ConversionQuoteDto,
  ConversionQuoteResponseDto,
} from '../dto/conversion-quote.dto';
import { CreateConvertDto } from '../dto/create-convert.dto';
import { ConvertResponseDto } from '../dto/convert-response.dto';
import { TransactionType } from 'src/transactions/enums/transaction-type.enum';
import { TransactionStatus } from 'src/transactions/enums/transaction-status.enum';
import { NotificationType } from 'src/notifications/enum/notificationType.enum';
import { NotificationPriority } from 'src/notifications/enum/notificationPriority.enum';
import { NotificationChannel } from 'src/notifications/enum/notificationChannel.enum';
import { InjectRepository } from '@nestjs/typeorm';
import {
  SUPPORTED_CURRENCIES,
  SupportedCurrency,
  EXCHANGE_RATES,
  getExchangeRate,
  isSupportedCurrency,
} from 'src/currencies/constants/supported-currencies';

@Injectable()
export class ConvertService {
  private readonly logger = new Logger(ConvertService.name);

  // Supported currencies for conversion - only NGN and USD
  private readonly supportedCurrencies = SUPPORTED_CURRENCIES;

  // Exchange rates for NGN and USD only
  private readonly exchangeRates = EXCHANGE_RATES;

  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(User) private userRepository: Repository<User>,
    @InjectRepository(Currency)
    private currencyRepository: Repository<Currency>,
    private notificationsService: NotificationsService,
    private currenciesService: CurrenciesService,
  ) {}

  async getConversionQuote(
    quoteDto: ConversionQuoteDto,
  ): Promise<ConversionQuoteResponseDto> {
    const { fromCurrency, toCurrency, amount } = quoteDto;

    // Validate currencies
    this.validateCurrencies(fromCurrency, toCurrency);

    // Get exchange rate
    const exchangeRate = this.getExchangeRate(fromCurrency, toCurrency);

    // Calculate converted amount
    const convertedAmount = this.calculateConvertedAmount(amount, exchangeRate);

    // Calculate fee (200 NGN as shown in Figma)
    const feeAmount = this.calculateFee(fromCurrency, amount);
    const feeCurrency = fromCurrency;

    // Total deduction
    const totalDeduction = amount + feeAmount;

    // Quote expires in 5 minutes
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    return {
      exchangeRate,
      convertedAmount,
      feeAmount,
      feeCurrency,
      totalDeduction,
      expiresAt,
      quoteId: `quote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  async convertCurrency(
    userId: string,
    createConvertDto: CreateConvertDto,
  ): Promise<ConvertResponseDto> {
    const { fromCurrency, toCurrency, amount, description } = createConvertDto;

    this.logger.log(
      `Converting ${amount} ${fromCurrency} to ${toCurrency} for user ${userId}`,
    );

    // Validate currencies
    this.validateCurrencies(fromCurrency, toCurrency);

    // Get user
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get exchange rate
    const exchangeRate = this.getExchangeRate(fromCurrency, toCurrency);

    // Calculate converted amount
    const convertedAmount = this.calculateConvertedAmount(amount, exchangeRate);

    // Calculate fee
    const feeAmount = this.calculateFee(fromCurrency, amount);
    const totalDeduction = amount + feeAmount;

    // Validate user balance
    await this.validateUserBalance(user, fromCurrency, totalDeduction);

    // Generate unique reference
    const reference = this.generateConversionReference();

    try {
      // Create conversion transaction
      const transaction = this.transactionRepository.create({
        initiatorId: userId,
        asset: fromCurrency,
        type: TransactionType.CONVERSION,
        status: TransactionStatus.COMPLETED,
        currencyId: fromCurrency,
        amount,
        totalAmount: totalDeduction,
        feeAmount,
        feeCurrencyId: fromCurrency,
        reference,
        description:
          description ||
          `Convert ${amount} ${fromCurrency} to ${convertedAmount} ${toCurrency}`,
        metadata: {
          fromCurrency,
          toCurrency,
          originalAmount: amount,
          convertedAmount,
          exchangeRate,
          feeAmount,
          totalDeduction,
        },
      });

      const savedTransaction =
        await this.transactionRepository.save(transaction);

      // Update user balances
      await this.updateUserBalances(
        user,
        fromCurrency,
        toCurrency,
        totalDeduction,
        convertedAmount,
      );

      // Send notification
      await this.sendConversionNotification(
        user,
        Array.isArray(savedTransaction)
          ? savedTransaction[0]
          : savedTransaction,
      );

      this.logger.log(`Conversion completed successfully: ${reference}`);

      return this.mapToConvertResponse(
        Array.isArray(savedTransaction)
          ? savedTransaction[0]
          : savedTransaction,
      );
    } catch (error) {
      this.logger.error(`Conversion failed for user ${userId}:`, error);
      throw new UnprocessableEntityException(
        'Conversion failed. Please try again.',
      );
    }
  }

  async getConversionHistory(
    userId: string,
    filters: {
      page: number;
      limit: number;
      fromCurrency?: string;
      toCurrency?: string;
    },
  ) {
    const { page, limit, fromCurrency, toCurrency } = filters;
    const skip = (page - 1) * limit;

    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.initiatorId = :userId', { userId })
      .andWhere('transaction.type = :type', {
        type: TransactionType.CONVERSION,
      })
      .orderBy('transaction.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (fromCurrency) {
      queryBuilder.andWhere('transaction.asset = :fromCurrency', {
        fromCurrency,
      });
    }

    if (toCurrency) {
      queryBuilder.andWhere(
        "JSON_EXTRACT(transaction.metadata, '$.toCurrency') = :toCurrency",
        { toCurrency },
      );
    }

    const [transactions, total] = await queryBuilder.getManyAndCount();

    return {
      data: transactions.map((transaction) =>
        this.mapToConvertResponse(transaction),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getConversionById(
    userId: string,
    id: string,
  ): Promise<ConvertResponseDto> {
    const transaction = await this.transactionRepository.findOne({
      where: {
        id,
        initiatorId: userId,
        type: TransactionType.CONVERSION,
      },
    });

    if (!transaction) {
      throw new NotFoundException('Conversion not found');
    }

    return this.mapToConvertResponse(transaction);
  }

  async getSupportedCurrencies() {
    return {
      currencies: this.supportedCurrencies.map((code) => ({
        code,
        name: this.getCurrencyName(code),
        symbol: this.getCurrencySymbol(code),
      })),
    };
  }

  async getExchangeRates(base?: string) {
    const baseCurrency = base || 'NGN';

    if (!isSupportedCurrency(baseCurrency)) {
      throw new BadRequestException('Unsupported base currency. Only NGN and USD are supported');
    }

    return {
      base: baseCurrency,
      rates: this.exchangeRates[baseCurrency] || {},
      timestamp: new Date().toISOString(),
    };
  }

  private validateCurrencies(fromCurrency: string, toCurrency: string): void {
    if (!isSupportedCurrency(fromCurrency)) {
      throw new BadRequestException(
        `Unsupported source currency: ${fromCurrency}. Only ${SUPPORTED_CURRENCIES.join(' and ')} are supported`,
      );
    }

    if (!isSupportedCurrency(toCurrency)) {
      throw new BadRequestException(
        `Unsupported target currency: ${toCurrency}. Only ${SUPPORTED_CURRENCIES.join(' and ')} are supported`,
      );
    }

    if (fromCurrency === toCurrency) {
      throw new BadRequestException('Cannot convert currency to itself');
    }
  }

  private getExchangeRate(fromCurrency: string, toCurrency: string): number {
    return getExchangeRate(fromCurrency as SupportedCurrency, toCurrency as SupportedCurrency);
  }

  private calculateConvertedAmount(
    amount: number,
    exchangeRate: number,
  ): number {
    return Math.round(amount * exchangeRate * 100) / 100; // Round to 2 decimal places
  }

  private calculateFee(currency: string, amount: number): number {
    // Fee structure: 200 NGN equivalent
    if (currency === 'NGN') {
      return 200;
    }

    if (currency === 'USD') {
      // Convert 200 NGN to USD (200 * 0.00062 = 0.124 USD)
      return 0.124;
    }

    return 0; // No fee for unsupported currencies
  }

  private async validateUserBalance(
    user: User,
    currency: string,
    requiredAmount: number,
  ): Promise<void> {
    // For now, we'll assume user has sufficient balance if amount is reasonable
    const mockBalance = this.getMockUserBalance(currency);

    if (mockBalance < requiredAmount) {
      throw new UnprocessableEntityException(
        `Insufficient ${currency} balance. Required: ${requiredAmount}, Available: ${mockBalance}`,
      );
    }
  }

  private getMockUserBalance(currency: string): number {
    // Mock balances for testing - only NGN and USD
    const mockBalances = {
      NGN: 1000000,
      USD: 1000,
    };

    return mockBalances[currency] || 0;
  }

  private async updateUserBalances(
    user: User,
    fromCurrency: string,
    toCurrency: string,
    deductAmount: number,
    creditAmount: number,
  ): Promise<void> {
    this.logger.log(
      `Updated balances for user ${user.id}: -${deductAmount} ${fromCurrency}, +${creditAmount} ${toCurrency}`,
    );
  }

  private generateConversionReference(): string {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const randomStr = Math.random().toString(36).substr(2, 6).toUpperCase();
    return `CONV-${dateStr}-${randomStr}`;
  }

  private async sendConversionNotification(
    user: User,
    transaction: Transaction,
  ): Promise<void> {
    try {
      const metadata = transaction.metadata as any;
      const message = `You have successfully converted ${transaction.amount} ${metadata.fromCurrency} to ${metadata.convertedAmount} ${metadata.toCurrency}.`;

      await this.notificationsService.create({
        userId: user.id,
        title: 'Conversion Successful',
        message,
        type: NotificationType.TRANSACTION,
        priority: NotificationPriority.MEDIUM,
        channel: NotificationChannel.IN_APP,
        metadata: {
          transactionId: transaction.id,
          reference: transaction.reference,
          type: 'conversion_success',
        },
      });
    } catch (error) {
      this.logger.error('Failed to send conversion notification:', error);
    }
  }

  private mapToConvertResponse(transaction: Transaction): ConvertResponseDto {
    const metadata = transaction.metadata as any;

    return {
      id: transaction.id,
      userId: transaction.initiatorId,
      reference: transaction.reference,
      fromCurrency: metadata.fromCurrency || transaction.asset,
      toCurrency: metadata.toCurrency,
      amount: transaction.amount,
      convertedAmount: metadata.convertedAmount,
      exchangeRate: metadata.exchangeRate,
      feeAmount: transaction.feeAmount ?? 0,
      feeCurrency:
        transaction.feeCurrency?.code ||
        transaction.currency?.code ||
        transaction.asset,
      status: transaction.status,
      createdAt: transaction.createdAt,
    };
  }

  private getCurrencyName(code: string): string {
    const names = {
      NGN: 'Nigerian Naira',
      USD: 'US Dollar',
    };

    return names[code] || code;
  }

  private getCurrencySymbol(code: string): string {
    const symbols = {
      NGN: '₦',
      USD: '$',
    };

    return symbols[code] || code;
  }
}
