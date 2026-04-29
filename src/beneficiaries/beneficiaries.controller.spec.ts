import { Test, TestingModule } from '@nestjs/testing';
import { BeneficiariesController } from './beneficiaries.controller';
import { BeneficiariesService } from './beneficiaries.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Beneficiary } from './entities/beneficiary.entity';

describe('BeneficiariesController', () => {
  let controller: BeneficiariesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BeneficiariesController],
      providers: [
        BeneficiariesService,
        {
          provide: getRepositoryToken(Beneficiary),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<BeneficiariesController>(BeneficiariesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
