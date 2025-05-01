import { Test, TestingModule } from '@nestjs/testing';
import { TransactionTaggingController } from './transaction-tagging.controller';
import { TransactionTaggingService } from './transaction-tagging.service';

describe('TransactionTaggingController', () => {
  let controller: TransactionTaggingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionTaggingController],
      providers: [TransactionTaggingService],
    }).compile();

    controller = module.get<TransactionTaggingController>(TransactionTaggingController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
