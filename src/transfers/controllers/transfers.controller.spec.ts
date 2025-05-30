import { Test, TestingModule } from '@nestjs/testing';
import { TransfersController } from './transfers.controller';
import { ScheduledTransfersService } from '../providers/transfers.service';

describe('TransfersController', () => {
  let controller: TransfersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransfersController],
      providers: [ScheduledTransfersService],
    }).compile();

    controller = module.get<TransfersController>(TransfersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
