import { Test, TestingModule } from '@nestjs/testing';
import { ScheduledTransfersProcessor } from './scheduled-transfers.processor';
import { ScheduledTransfersService } from './scheduled-transfers.service';
import { Logger } from '@nestjs/common';

describe('ScheduledTransfersProcessor', () => {
  let processor: ScheduledTransfersProcessor;
  let service: ScheduledTransfersService;

  const mockService = {
    getPendingScheduledTransfers: jest.fn(),
    executeScheduledTransfer: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduledTransfersProcessor,
        {
          provide: ScheduledTransfersService,
          useValue: mockService,
        },
      ],
    }).compile();

    processor = module.get<ScheduledTransfersProcessor>(ScheduledTransfersProcessor);
    service = module.get<ScheduledTransfersService>(ScheduledTransfersService);
    
    // Mock logger to avoid console output during tests
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('processScheduledTransfers', () => {
    it('should process pending transfers', async () => {
      const pendingTransfers = [
        { id: 'transfer-1' },
        { id: 'transfer-2' },
      ];
      
      mockService.getPendingScheduledTransfers.mockResolvedValue(pendingTransfers);
      mockService.executeScheduledTransfer.mockResolvedValue({});
      
      await processor.processScheduledTransfers();
      
      expect(mockService.getPendingScheduledTransfers).toHaveBeenCalled();
      expect(mockService.executeScheduledTransfer).toHaveBeenCalledWith('transfer-1');
      expect(mockService.executeScheduledTransfer).toHaveBeenCalledWith('transfer-2');
      expect(mockService.executeScheduledTransfer).toHaveBeenCalledTimes(2);
    });
    
    it('should handle errors when executing transfers', async () => {
      const pendingTransfers = [
        { id: 'transfer-1' },
        { id: 'transfer-2' },
      ];
      
      mockService.getPendingScheduledTransfers.mockResolvedValue(pendingTransfers);
      mockService.executeScheduledTransfer
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Execution failed'));
      
      await processor.processScheduledTransfers();
      
      expect(mockService.getPendingScheduledTransfers).toH