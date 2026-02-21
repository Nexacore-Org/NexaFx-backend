import { Test, TestingModule } from '@nestjs/testing';
import { BeneficiariesService } from './beneficiaries.service';

describe('BeneficiariesService', () => {
  let service: BeneficiariesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BeneficiariesService],
    }).compile();

    service = module.get<BeneficiariesService>(BeneficiariesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
