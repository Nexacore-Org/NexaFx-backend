import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RiskModule } from './risk.module';
import { RiskService } from './risk.service';
import { RiskController } from './risk.controller';
import { CustomerRiskRating } from './entities/customer-risk-rating.entity';
import { User } from '../../users/user.entity';
import { TransactionLimit } from '../../transactions/entities/transaction-limit.entity';
import { createMockRepository } from '../../../test/mocks/factories';

describe('RiskModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [RiskModule],
    })
      .overrideProvider(getRepositoryToken(CustomerRiskRating))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(User))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(TransactionLimit))
      .useValue(createMockRepository())
      .compile();
  });

  it('should compile the module and resolve providers and controller', () => {
    expect(module).toBeDefined();
    const service = module.get<RiskService>(RiskService);
    const controller = module.get<RiskController>(RiskController);
    expect(service).toBeDefined();
    expect(controller).toBeDefined();
  });
});
