import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionsService } from './transactions.service';
import { Transaction } from './entities/transaction.entity';

describe('TransactionsService', () => {
    let service: TransactionsService;
    let repository: Repository<Transaction>;

    const mockRepository = {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        delete: jest.fn(),
    };

    const mockTransaction = {
        id: '123',
        amount: 100,
        currency: 'USD',
        type: 'DEPOSIT',
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                TransactionsService,
                {
                    provide: getRepositoryToken(Transaction),
                    useValue: mockRepository,
                },
            ],
        }).compile();

        service = module.get<TransactionsService>(TransactionsService);
        repository = module.get<Repository<Transaction>>(getRepositoryToken(Transaction));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('findAll', () => {
        it('should return all transactions', async () => {
            const transactions = [mockTransaction];
            mockRepository.find.mockResolvedValue(transactions);

            const result = await service.findAll();

            expect(result).toEqual(transactions);
            expect(mockRepository.find).toHaveBeenCalled();
        });
    });

    describe('findOne', () => {
        it('should return a transaction by id', async () => {
            mockRepository.findOne.mockResolvedValue(mockTransaction);

            const result = await service.findOne('123');

            expect(result).toEqual(mockTransaction);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { id: '123' },
            });
        });
    });
});
