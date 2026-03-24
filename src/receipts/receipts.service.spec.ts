import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptsService } from './receipts.service';
// Improved PDFKit mock to emit 'data' and 'end' events for Promise resolution
import { EventEmitter } from 'events';
jest.mock('pdfkit', () => {
  return {
    default: jest.fn().mockImplementation(() => {
      const emitter = new EventEmitter();
      // Chainable methods (cast to any to avoid TS errors)
      (emitter as any).text = jest.fn().mockReturnValue(emitter);
      (emitter as any).fontSize = jest.fn().mockReturnValue(emitter);
      (emitter as any).moveDown = jest.fn().mockReturnValue(emitter);
      (emitter as any).addPage = jest.fn().mockReturnValue(emitter);
      (emitter as any).pipe = jest.fn();
      (emitter as any).end = jest.fn(() => {
        // Simulate PDF generation
        emitter.emit('data', Buffer.from('PDFDATA'));
        emitter.emit('end');
      });
      return emitter;
    }),
  };
});
import { getRepositoryToken } from '@nestjs/typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';
import { Repository, Between } from 'typeorm';

const mockTransactions = [
  {
    id: '1',
    userId: 'user-1',
    type: 'DEPOSIT',
    amount: '100',
    currency: 'USD',
    rate: '1',
    status: 'SUCCESS',
    txHash: 'hash1',
    feeAmount: '2',
    createdAt: new Date('2025-01-15T12:00:00Z'),
    user: { email: 'test@example.com' },
  },
  {
    id: '2',
    userId: 'user-1',
    type: 'WITHDRAW',
    amount: '50',
    currency: 'USD',
    rate: '1',
    status: 'SUCCESS',
    txHash: 'hash2',
    feeAmount: '1',
    createdAt: new Date('2025-01-20T12:00:00Z'),
    user: { email: 'test@example.com' },
  },
  {
    id: '3',
    userId: 'user-1',
    type: 'DEPOSIT',
    amount: '200',
    currency: 'USD',
    rate: '1',
    status: 'SUCCESS',
    txHash: 'hash3',
    feeAmount: '3',
    createdAt: new Date('2025-02-10T12:00:00Z'),
    user: { email: 'test@example.com' },
  },
];

describe('ReceiptsService', () => {
  let service: ReceiptsService;
  let transactionRepository: Repository<Transaction>;
  let usersService: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptsService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findById: jest.fn().mockResolvedValue({ email: 'test@example.com' }),
          },
        },
        {
          provide: ConfigService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<ReceiptsService>(ReceiptsService);
    transactionRepository = module.get<Repository<Transaction>>(getRepositoryToken(Transaction));
    usersService = module.get<UsersService>(UsersService);
  });

  it('should only return transactions within the requested month', async () => {
    jest.spyOn(transactionRepository, 'find').mockResolvedValue(
      mockTransactions.filter(
        (t) => t.createdAt >= new Date('2025-01-01') && t.createdAt <= new Date('2025-01-31T23:59:59.999Z')
      ) as any,
    );
    const buffer = await service.generateMonthlyStatement('user-1', '2025-01');
    expect(buffer).toBeInstanceOf(Buffer);
    expect(transactionRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          createdAt: expect.any(Object),
        }),
      })
    );
  });

  it('should call Between with correct start and end dates', async () => {
    const findSpy = jest.spyOn(transactionRepository, 'find').mockResolvedValue([]);
    await expect(service.generateMonthlyStatement('user-1', '2025-01')).rejects.toThrow();
    const call = findSpy.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    const where = call?.where;
    expect(where).toBeDefined();
    // Handle possible array structure
    const whereObj = Array.isArray(where) ? where[0] : where;
    expect(whereObj).toBeDefined();
    const callArgs = whereObj?.createdAt;
    expect(callArgs).toBeDefined();
    // Only check FindOperator properties if present
    if (callArgs && typeof callArgs === 'object' && 'type' in callArgs && 'value' in callArgs) {
      expect((callArgs as any).type).toBe('between');
      expect(Array.isArray((callArgs as any).value)).toBe(true);
      expect((callArgs as any).value[0]).toEqual(new Date(2025, 0, 1));
      expect((callArgs as any).value[1]).toEqual(new Date(2025, 0, 31, 23, 59, 59, 999));
    } else {
      throw new Error('createdAt is not a FindOperator');
    }
  });
});
