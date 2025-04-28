import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsService } from './transactions.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, Transaction } from 'typeorm';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { Currency } from 'src/currencies/entities/currency.entity';
import { beforeEach, describe, it } from 'node:test';
import { TransactionType } from './enums/transaction-type.enum';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let transactionRepo: Repository<Transaction>;
  let currencyRepo: Repository<Currency>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: getRepositoryToken(Transaction),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(Currency),
          useClass: Repository,
        },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    transactionRepo = module.get<Repository<Transaction>>(getRepositoryToken(Transaction));
    currencyRepo = module.get<Repository<Currency>>(getRepositoryToken(Currency));
  });

  it('should calculate fee and total correctly when creating a transaction', async () => {
    // Arrange
    const createTransactionDto = {
      userId: 'user-uuid',
      currencyId: 'currency-uuid',
      amount: 1000,
      type: TransactionType.TRANSFER,
      description: 'Test transaction',
      sourceAccount: 'source-acc',
      destinationAccount: 'dest-acc',
      reference: 'some-reference'
    };

    const mockCurrency = {
      id: 'currency-uuid',
      feePercentage: 0.02, // 2%
    } as Currency;

    const saveMock = jest.spyOn(transactionRepo, 'save').mockImplementation(async (transaction: any) => ({
        ...transaction,
        id: 'transaction-uuid', // simulate that the transaction got an ID after saving
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
    jest.spyOn(currencyRepo, 'findOne').mockResolvedValue(mockCurrency);

    // Act
    const transaction = await service.createTransaction(createTransactionDto);

    // Assert
    const expectedFee = 1000 * 0.02; // 20
    const expectedTotal = 1000 + expectedFee; // 1020

    expect(transaction.amount).toBeCloseTo(expectedTotal, 2);
    expect(transaction.feeAmount).toBeCloseTo(expectedFee, 2);
    expect(transaction.feeCurrencyId).toEqual(createTransactionDto.currencyId);
    expect(transaction.metadata).toEqual({
      baseAmount: 1000,
      feePercentage: 0.02,
      feeAmount: parseFloat(expectedFee.toFixed(2)),
      totalAmount: parseFloat(expectedTotal.toFixed(2)),
    });

    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('should throw an error if currency not found', async () => {
    // Arrange
    const createTransactionDto = {
      userId: 'user-uuid',
      currencyId: 'invalid-currency-uuid',
      amount: 500,
      type: TransactionType.SWAP,
      description: 'Missing currency test',
      sourceAccount: 'src-acc',
      destinationAccount: 'dst-acc',
      reference: 'some-reference'
    };

    jest.spyOn(currencyRepo, 'findOne').mockResolvedValue(null);

    // Act & Assert
    await expect(service.createTransaction(createTransactionDto)).rejects.toThrow('Currency not found.');
  });
});