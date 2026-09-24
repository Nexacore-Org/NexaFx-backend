import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import { ConversionQuote, ConversionQuoteStatus } from './entities/conversion-quote.entity';
import { Transaction, TransactionStatus, TransactionType } from '../../transactions/entities/transaction.entity';
import { User } from '../../users/user.entity';
import { Wallet, StellarNetwork } from '../../wallets/entities/wallet.entity';
import { LedgerEntry } from '../../ledger/entities/ledger-entry.entity';
import { ExchangeRatesService } from '../../exchange-rates/exchange-rates.service';
import { LedgerService } from '../../ledger/services/ledger.service';
import { ConversionsGateway } from './conversions.gateway';
import { CreateQuoteDto } from './dtos/create-quote.dto';
import { ExecuteConversionDto } from './dtos/execute-conversion.dto';

@Injectable()
export class ConversionsService {
  private readonly logger = new Logger(ConversionsService.name);

  constructor(
    @InjectRepository(ConversionQuote)
    private readonly quoteRepository: Repository<ConversionQuote>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly ledgerService: LedgerService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly conversionsGateway: ConversionsGateway,
  ) {}

  async createQuote(userId: string, dto: CreateQuoteDto) {
    const fromCurrency = (dto.fromCurrency || '').toUpperCase();
    const toCurrency = (dto.toCurrency || '').toUpperCase();

    if (!fromCurrency || !toCurrency) {
      throw new BadRequestException('fromCurrency and toCurrency are required');
    }

    if (fromCurrency === toCurrency) {
      throw new BadRequestException('Cannot convert same currency');
    }

    let fromAmountDec: Decimal;
    try {
      fromAmountDec = new Decimal(dto.fromAmount.toString());
    } catch {
      throw new BadRequestException('Invalid fromAmount');
    }

    if (!fromAmountDec.isFinite() || fromAmountDec.lte(0)) {
      throw new BadRequestException('Amount must be positive');
    }

    const exchangeRate = await this.exchangeRatesService.getRate(fromCurrency, toCurrency);
    if (!exchangeRate || exchangeRate.rate === undefined || exchangeRate.rate === null) {
      throw new BadRequestException(`Unable to fetch exchange rate for ${fromCurrency}/${toCurrency}`);
    }

    const feePercentStr = this.configService.get<string>('CONVERSION_FEE_PERCENT') ?? '0.5';
    const feePercentDec = new Decimal(feePercentStr);

    const feeDec = fromAmountDec.mul(feePercentDec).div(100);
    const netAmountDec = fromAmountDec.sub(feeDec);
    const rateDec = new Decimal(exchangeRate.rate);
    const toAmountDec = netAmountDec.mul(rateDec);

    const expiresAt = new Date(Date.now() + 30000); // 30 seconds rate locking

    const quote = this.quoteRepository.create({
      userId,
      fromCurrency,
      toCurrency,
      fromAmount: fromAmountDec.toFixed(8),
      toAmount: toAmountDec.toFixed(8),
      rate: rateDec.toFixed(8),
      fee: feeDec.toFixed(8),
      feePercent: feePercentDec.toFixed(4),
      expiresAt,
      status: ConversionQuoteStatus.PENDING,
    });

    const saved = await this.quoteRepository.save(quote);

    return {
      quoteId: saved.id,
      fromAmount: saved.fromAmount,
      toAmount: saved.toAmount,
      fee: saved.fee,
      rate: saved.rate,
      expiresAt: saved.expiresAt.toISOString(),
    };
  }

  async executeConversion(userId: string, dto: ExecuteConversionDto) {
    const quote = await this.quoteRepository.findOne({ where: { id: dto.quoteId } });

    if (!quote) {
      throw new UnprocessableEntityException('Quote not found');
    }

    if (quote.userId !== userId) {
      throw new UnprocessableEntityException('Quote does not belong to authenticated user');
    }

    if (quote.status !== ConversionQuoteStatus.PENDING) {
      throw new UnprocessableEntityException('Quote is not pending or already used');
    }

    if (quote.usedAt != null) {
      throw new UnprocessableEntityException('Quote already used');
    }

    if (new Date() > quote.expiresAt) {
      quote.status = ConversionQuoteStatus.EXPIRED;
      await this.quoteRepository.save(quote);
      throw new UnprocessableEntityException('Quote has expired');
    }

    // Slippage protection check (1% threshold)
    const latestRateRes = await this.exchangeRatesService.getRate(quote.fromCurrency, quote.toCurrency);
    const quotedRateDec = new Decimal(quote.rate);
    const currentRateDec = new Decimal(latestRateRes.rate);
    const rateDiffDec = currentRateDec.sub(quotedRateDec).abs().div(quotedRateDec);

    if (rateDiffDec.gt(new Decimal('0.01'))) {
      quote.status = ConversionQuoteStatus.EXPIRED;
      await this.quoteRepository.save(quote);
      throw new UnprocessableEntityException('Rate movement exceeds 1% slippage threshold. Quote is no longer valid.');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const lockedQuote = await queryRunner.manager.findOne(ConversionQuote, {
        where: { id: quote.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedQuote || lockedQuote.status !== ConversionQuoteStatus.PENDING || lockedQuote.usedAt != null) {
        throw new UnprocessableEntityException('Quote is no longer available for execution');
      }

      const user = await queryRunner.manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      await queryRunner.manager.find(Wallet, {
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });

      user.balances ??= {};
      const fromCurr = quote.fromCurrency;
      const toCurr = quote.toCurrency;

      const sourceBalanceDec = new Decimal(user.balances[fromCurr]?.toString() ?? '0');
      const requiredFromDec = new Decimal(quote.fromAmount);

      if (sourceBalanceDec.lt(requiredFromDec)) {
        throw new UnprocessableEntityException('Insufficient balance in source wallet');
      }

      // Auto-create target wallet in wallets table if missing
      const targetWalletLabel = `${toCurr} Wallet`;
      const destWallet = await queryRunner.manager.findOne(Wallet, {
        where: { userId, label: targetWalletLabel },
      });

      if (!destWallet) {
        const newWallet = queryRunner.manager.create(Wallet, {
          userId,
          publicKey: user.walletPublicKey || `auto-${userId}-${toCurr.toLowerCase()}`,
          encryptedSecretKey: user.walletSecretKeyEncrypted || null,
          label: targetWalletLabel,
          isDefault: false,
          network: StellarNetwork.TESTNET,
        });
        await queryRunner.manager.save(Wallet, newWallet);
      }

      // Debit source and credit destination
      const newSourceBalanceDec = sourceBalanceDec.sub(requiredFromDec);
      const destBalanceDec = new Decimal(user.balances[toCurr]?.toString() ?? '0');
      const newDestBalanceDec = destBalanceDec.add(new Decimal(quote.toAmount));

      user.balances[fromCurr] = newSourceBalanceDec.toNumber();
      user.balances[toCurr] = newDestBalanceDec.toNumber();

      await queryRunner.manager.save(User, user);

      // Create transaction record
      const txType = (TransactionType as any).EXCHANGE || TransactionType.SWAP;
      const tx = queryRunner.manager.create(Transaction, {
        userId,
        type: txType,
        amount: quote.fromAmount,
        currency: fromCurr,
        toAmount: quote.toAmount,
        toCurrency: toCurr,
        rate: quote.rate,
        feeAmount: quote.fee,
        feeCurrency: fromCurr,
        status: TransactionStatus.SUCCESS,
        metadata: { quoteId: quote.id },
      });
      const savedTx = await queryRunner.manager.save(Transaction, tx);

      // Create ledger entries
      await this.ledgerService.record(savedTx, queryRunner);

      // Update quote state
      lockedQuote.status = ConversionQuoteStatus.USED;
      lockedQuote.usedAt = new Date();
      await queryRunner.manager.save(ConversionQuote, lockedQuote);

      await queryRunner.commitTransaction();

      // Emit WebSocket notification
      this.conversionsGateway.emitTransactionUpdated({
        transactionId: savedTx.id,
        id: savedTx.id,
        userId,
        type: savedTx.type,
        status: savedTx.status,
        fromCurrency: fromCurr,
        toCurrency: toCurr,
        fromAmount: quote.fromAmount,
        toAmount: quote.toAmount,
        createdAt: savedTx.createdAt,
      });

      return {
        transaction: savedTx,
        quote: lockedQuote,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async getConversions(userId: string, page = 1, limit = 10) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Math.min(100, Number(limit) || 10));

    const [quotes, total] = await this.quoteRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limitNum,
      skip: (pageNum - 1) * limitNum,
    });

    return {
      data: quotes,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async getConversionById(userId: string, id: string) {
    const quote = await this.quoteRepository.findOne({ where: { id, userId } });
    if (!quote) {
      throw new NotFoundException('Conversion quote not found');
    }

    const transactions = await this.transactionRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    const transaction = transactions.find(
      (t) => t.metadata?.quoteId === quote.id || (t.currency === quote.fromCurrency && t.toCurrency === quote.toCurrency && t.amount === quote.fromAmount),
    );

    let ledgerEntries: LedgerEntry[] = [];
    if (transaction) {
      ledgerEntries = await this.dataSource.getRepository(LedgerEntry).find({
        where: { transactionId: transaction.id },
      });
    }

    return {
      quote,
      transaction: transaction || null,
      ledgerEntries,
      currencies: {
        from: quote.fromCurrency,
        to: quote.toCurrency,
      },
      fee: quote.fee,
      rate: quote.rate,
      timestamps: {
        createdAt: quote.createdAt,
        expiresAt: quote.expiresAt,
        usedAt: quote.usedAt,
      },
    };
  }
}
