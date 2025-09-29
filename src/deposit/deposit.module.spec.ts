import { Test, TestingModule } from '@nestjs/testing';
import { DepositModule } from './deposit.module';
import { DepositController } from './controllers/deposit.controller';
import { DepositService } from './providers/deposit.service';

describe('DepositModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [DepositModule],
    }).compile();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should have DepositController defined', () => {
    const controller = module.get<DepositController>(DepositController);
    expect(controller).toBeDefined();
  });

  it('should have DepositService defined', () => {
    const service = module.get<DepositService>(DepositService);
    expect(service).toBeDefined();
  });

  it('should export DepositService', () => {
    const service = module.get<DepositService>(DepositService);
    expect(service).toBeDefined();
  });
});
