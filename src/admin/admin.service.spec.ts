import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminService } from './admin.service';
import { User, UserRole } from '../users/user.entity';
import { Transaction, TransactionStatus, TransactionType } from '../transactions/entities/transaction.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserQueryDto } from './dto/user-query.dto';

describe('AdminService', () => {
  let service: AdminService;
  let userRepository: Repository<User>;
  let transactionRepository: Repository<Transaction>;
  let auditLogsService: AuditLogsService;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    role: UserRole.USER,
    isSuspended: false,
    isVerified: true,
    createdAt: new Date(),
  } as User;

  const mockTransaction: Transaction = {
    id: 'tx-123',
    type: TransactionType.DEPOSIT,
    amount: '100.00',
    currency: 'USD',
    status: TransactionStatus.SUCCESS,
    createdAt: new Date(),
  } as Transaction;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            count: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              addGroupBy: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              leftJoinAndSelect: jest.fn().mockReturnThis(),
              getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
              getRawMany: jest.fn().mockResolvedValue([]),
            })),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            count: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(() => ({
              select: jest.fn().mockReturnThis(),
              addSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              andWhere: jest.fn().mockReturnThis(),
              groupBy: jest.fn().mockReturnThis(),
              addGroupBy: jest.fn().mockReturnThis(),
              skip: jest.fn().mockReturnThis(),
              take: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              leftJoinAndSelect: jest.fn().mockReturnThis(),
              getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
              getRawMany: jest.fn().mockResolvedValue([]),
            })),
          },
        },
        {
          provide: AuditLogsService,
          useValue: {
            logAuthEvent: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    transactionRepository = module.get<Repository<Transaction>>(getRepositoryToken(Transaction));
    auditLogsService = module.get<AuditLogsService>(AuditLogsService);
  });

  describe('unsuspendUser', () => {
    it('should unsuspend user', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue({ ...mockUser, isSuspended: true });
      jest.spyOn(userRepository, 'save').mockImplementation(async (u) => u as User);

      await service.unsuspendUser('user-123', 'admin-123');

      expect(auditLogsService.logAuthEvent).toHaveBeenCalledWith(
        'admin-123',
        expect.stringContaining('UNSUSPEND'),
        expect.anything(),
        true
      );
    });

    it('should throw BadRequestException if not suspended', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue({ ...mockUser, isSuspended: false });

      await expect(service.unsuspendUser('user-123', 'admin-123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getTransactions', () => {
    it('should return paginated transactions', async () => {
      const query = { page: 1, limit: 10 };
      const transactions = [mockTransaction];
      const total = 1;

      const queryBuilder: any = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([transactions, total]),
      };

      jest.spyOn(transactionRepository, 'createQueryBuilder').mockReturnValue(queryBuilder);

      const result = await service.getTransactions(query);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });
});

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPlatformMetrics', () => {
    it('should return platform metrics', async () => {
      jest.spyOn(userRepository, 'count').mockResolvedValue(10);
      jest.spyOn(transactionRepository, 'count').mockResolvedValue(20);
      
      const result = await service.getPlatformMetrics();

      expect(result).toBeDefined();
      expect(result.users.total).toBe(10);
      expect(result.transactions.totalCount).toBe(20);
    });
  });

  describe('getUsers', () => {
    it('should return paginated users', async () => {
      const query: UserQueryDto = { page: 1, limit: 10 };
      const users = [mockUser];
      const total = 1;

      const queryBuilder: any = {
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([users, total]),
      };

      jest.spyOn(userRepository, 'createQueryBuilder').mockReturnValue(queryBuilder);

      const result = await service.getUsers(query);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('getUserById', () => {
    it('should return user details', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      
      const result = await service.getUserById('user-123');
      
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      
      await expect(service.getUserById('user-123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateUserRole', () => {
    it('should update user role', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue({ ...mockUser });
      jest.spyOn(userRepository, 'save').mockImplementation(async (u) => u as User);

      const result = await service.updateUserRole('user-123', { role: UserRole.ADMIN }, 'admin-123');

      expect(result.role).toBe(UserRole.ADMIN);
      expect(auditLogsService.logAuthEvent).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(service.updateUserRole('user-123', { role: UserRole.ADMIN }, 'admin-123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('suspendUser', () => {
    it('should suspend user', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue({ ...mockUser, isSuspended: false });
      jest.spyOn(userRepository, 'save').mockImplementation(async (u) => u as User);

      await service.suspendUser('user-123', 'admin-123');

      expect(auditLogsService.logAuthEvent).toHaveBeenCalledWith(
        'admin-123',
        expect.stringContaining('SUSPEND'),
        expect.anything(),
        true
      );
    });

    it('should throw BadRequestException if already suspended', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue({ ...mockUser, isSuspended: true });

      await expect(service.suspendUser('user-123', 'admin-123')).rejects.toThrow(BadRequestException);
    });
  });
});
