import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RevenueModule } from './revenue.module';
import { RevenueService } from './revenue.service';
import { RevenueController } from './revenue.controller';
import { RevenueSnapshot } from './entities/revenue-snapshot.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { createMockRepository } from '../../../test/mocks/factories';

describe('RevenueModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [RevenueModule],
    })
      .overrideProvider(getRepositoryToken(RevenueSnapshot))
      .useValue(createMockRepository())
      .overrideProvider(getRepositoryToken(Transaction))
      .useValue(createMockRepository())
      .compile();
  });

  it('should compile the module and resolve RevenueService and RevenueController', () => {
    expect(module).toBeDefined();
    const service = module.get<RevenueService>(RevenueService);
    const controller = module.get<RevenueController>(RevenueController);

    expect(service).toBeDefined();
    expect(controller).toBeDefined();
  });
});
