import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduledTransfersService } from './scheduled-transfers.service';
import { ScheduledTransferEntity, ScheduledTransferStatus } from './entities/scheduled-transfer.entity';
import { CreateScheduledTransferDto } from './dtos/create-scheduled-transfer.dto';

describe('ScheduledTransfersService', () => {
  let service: ScheduledTransfersService;
  let repository: Repository<ScheduledTransferEntity>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledTransfersService,
        {
          provide: getRepositoryToken(ScheduledTransferEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ScheduledTransfersService>(ScheduledTransfersService);
    repository = module.get<Repository<ScheduledTransferEntity>>(
      getRepositoryToken(ScheduledTransferEntity),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createScheduledTransfer', () => {
    it('should create a scheduled transfer', async () => {
      const userId = 'user-id';
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1); // tomorrow
      
      const createDto: CreateScheduledTransferDto = {
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        amount: 100,
        scheduledAt: futureDate,
      };
      
      const expectedTransfer = {
        id: 'transfer-id',
        userId,
        ...createDto,
        status: ScheduledTransferStatus.PENDING,
        executedAt: null,
      };
      
      mockRepository.create.mockReturnValue(expectedTransfer);
      mockRepository.save.mockResolvedValue(expectedTransfer);
      
      const result = await service.createScheduledTransfer(userId, createDto);
      
      expect(mockRepository.create).toHaveBeenCalledWith({
        userId,
        fromCurrency: createDto.fromCurrency,
        toCurrency: createDto.toCurrency,
        amount: createDto.amount,
        scheduledAt: createDto.scheduledAt,
        status: ScheduledTransferStatus.PENDING,
        executedAt: null,
      });
      
      expect(mockRepository.save).toHaveBeenCalledWith(expectedTransfer);
      expect(result).toEqual(expectedTransfer);
    });
    
    it('should throw an error if scheduled date is in the past', async () => {
      const userId = 'user-id';
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // yesterday
      
      const createDto: CreateScheduledTransferDto = {
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        amount: 100,
        scheduledAt: pastDate,
      };
      
      await expect(service.createScheduledTransfer(userId, createDto)).rejects.toThrow(
        'Scheduled date must be in the future',
      );
      
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('executeScheduledTransfer', () => {
    it('should execute a scheduled transfer', async () => {
      const transferId = 'transfer-id';
      const transfer = {
        id: transferId,
        userId: 'user-id',
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        amount: 100,
        scheduledAt: new Date(),
        status: ScheduledTransferStatus.PENDING,
        executedAt: null,
      };
      
      mockRepository.findOne.mockResolvedValue(transfer);
      mockRepository.save.mockImplementation((updatedTransfer) => Promise.resolve(updatedTransfer));
      
      const result = await service.executeScheduledTransfer(transferId);
      
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: transferId } });
      expect(result.status).toBe(ScheduledTransferStatus.EXECUTED);
      expect(result.executedAt).toBeDefined();
    });
    
    it('should throw an error if transfer is not found', async () => {
      const transferId = 'non-existent-id';
      
      mockRepository.findOne.mockResolvedValue(null);
      
      await expect(service.executeScheduledTransfer(transferId)).rejects.toThrow(
        `Scheduled transfer with ID ${transferId} not found`,
      );
    });
    
    it('should throw an error if transfer is not in pending status', async () => {
      const transferId = 'transfer-id';
      const transfer = {
        id: transferId,
        userId: 'user-id',
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        amount: 100,
        scheduledAt: new Date(),
        status: ScheduledTransferStatus.EXECUTED,
        executedAt: new Date(),
      };
      
      mockRepository.findOne.mockResolvedValue(transfer);
      
      await expect(service.executeScheduledTransfer(transferId)).rejects.toThrow(
        `Cannot execute transfer with status ${transfer.status}`,
      );
    });
  });
});