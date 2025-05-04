import { Test, TestingModule } from '@nestjs/testing';
import { ScheduledTransfersController } from './scheduled-transfers.controller';
import { ScheduledTransfersService } from './scheduled-transfers.service';
import { CreateScheduledTransferDto } from './dtos/create-scheduled-transfer.dto';
import { ScheduledTransferStatus } from './entities/scheduled-transfer.entity';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('ScheduledTransfersController', () => {
  let controller: ScheduledTransfersController;
  let service: ScheduledTransfersService;

  const mockService = {
    createScheduledTransfer: jest.fn(),
    getScheduledTransfersByUserId: jest.fn(),
    getScheduledTransferById: jest.fn(),
    deleteScheduledTransfer: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScheduledTransfersController],
      providers: [
        {
          provide: ScheduledTransfersService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<ScheduledTransfersController>(ScheduledTransfersController);
    service = module.get<ScheduledTransfersService>(ScheduledTransfersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
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
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      mockService.createScheduledTransfer.mockResolvedValue(expectedTransfer);
      
      const req = { user: { id: userId } };
      const result = await controller.createScheduledTransfer(req, createDto);
      
      expect(mockService.createScheduledTransfer).toHaveBeenCalledWith(userId, createDto);
      expect(result).toBeDefined();
      expect(result.id).toBe(expectedTransfer.id);
    });
  });

  describe('getMyScheduledTransfers', () => {
    it('should return user\'s scheduled transfers', async () => {
      const userId = 'user-id';
      const transfers = [
        {
          id: 'transfer-1',
          userId,
          fromCurrency: 'USD',
          toCurrency: 'EUR',
          amount: 100,
          scheduledAt: new Date(),
          status: ScheduledTransferStatus.PENDING,
          executedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      
      mockService.getScheduledTransfersByUserId.mockResolvedValue(transfers);
      
      const req = { user: { id: userId } };
      const result = await controller.getMyScheduledTransfers(req);
      
      expect(mockService.getScheduledTransfersByUserId).toHaveBeenCalledWith(userId);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(transfers[0].id);
      describe('deleteScheduledTransfer', () => {
        it('should delete a pending scheduled transfer', async () => {
          const userId = 'user-id';
          const transferId = 'transfer-id';
          const transfer = {
            id: transferId,
            userId,
            fromCurrency: 'USD',
            toCurrency: 'EUR',
            amount: 100,
            scheduledAt: new Date(),
            status: ScheduledTransferStatus.PENDING,
            executedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          
          mockService.getScheduledTransferById.mockResolvedValue(transfer);
          mockService.deleteScheduledTransfer.mockResolvedValue(undefined);
          
          const req = { user: { id: userId } };
          await controller.deleteScheduledTransfer(req, transferId);
          
          expect(mockService.getScheduledTransferById).toHaveBeenCalledWith(transferId);
          expect(mockService.deleteScheduledTransfer).toHaveBeenCalledWith(transferId);
        });
        
        it('should throw an error if transfer not found', async () => {
          const userId = 'user-id';
          const transferId = 'non-existent-id';
          
          mockService.getScheduledTransferById.mockResolvedValue(null);
          
          const req = { user: { id: userId } };
          
          await expect(controller.deleteScheduledTransfer(req, transferId)).rejects.toThrow(
            new HttpException('Scheduled transfer not found', HttpStatus.NOT_FOUND),
          );
        });
        
        it('should throw an error if user does not own the transfer', async () => {
          const userId = 'user-id';
          const transferId = 'transfer-id';
          const transfer = {
            id: transferId,
            userId: 'other-user-id',
            fromCurrency: 'USD',
            toCurrency: 'EUR',
            amount: 100,
            scheduledAt: new Date(),
            status: ScheduledTransferStatus.PENDING,
            executedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          
          mockService.getScheduledTransferById.mockResolvedValue(transfer);
          
          const req = { user: { id: userId } };
          
          await expect(controller.deleteScheduledTransfer(req, transferId)).rejects.toThrow(
            new HttpException('Unauthorized', HttpStatus.FORBIDDEN),
          );
        });
        
        it('should throw an error if transfer is not in pending status', async () => {
          const userId = 'user-id';
          const transferId = 'transfer-id';
          const transfer = {
            id: transferId,
            userId,
            fromCurrency: 'USD',
            toCurrency: 'EUR',
            amount: 100,
            scheduledAt: new Date(),
            status: ScheduledTransferStatus.EXECUTED,
            executedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          
          mockService.getScheduledTransferById.mockResolvedValue(transfer);
          
          const req = { user: { id: userId } };
          
          await expect(controller.deleteScheduledTransfer(req, transferId)).rejects.toThrow(
            new HttpException('Cannot delete a transfer that has already been processed', HttpStatus.BAD_REQUEST),
          );
        });
      });
    });
    