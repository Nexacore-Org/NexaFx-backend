import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { VerifyService } from './verify.service';
import { VerifyController } from './verify.controller';

// Mock stellar-sdk before imports
jest.mock('stellar-sdk', () => ({
  Horizon: {
    Server: jest.fn().mockImplementation(() => ({
      transactions: () => ({
        transaction: () => ({
          call: jest.fn().mockResolvedValue({}),
        }),
      }),
      operations: () => ({
        forTransaction: () => ({
          call: jest.fn().mockResolvedValue({ records: [] }),
        }),
      }),
    })),
  },
}));

describe('VerifyModule', () => {
  let module: TestingModule;
  let verifyService: VerifyService;
  let verifyController: VerifyController;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [VerifyController],
      providers: [
        VerifyService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'STELLAR_HORIZON_URL')
                return 'https://horizon-testnet.stellar.org';
              return undefined;
            }),
          },
        },
      ],
      exports: [VerifyService],
    }).compile();

    verifyService = module.get<VerifyService>(VerifyService);
    verifyController = module.get<VerifyController>(VerifyController);
  });

  afterEach(async () => {
    if (module) await module.close();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide VerifyService', () => {
    expect(verifyService).toBeDefined();
    expect(verifyService).toBeInstanceOf(VerifyService);
  });

  it('should have VerifyController', () => {
    expect(verifyController).toBeDefined();
    expect(verifyController).toBeInstanceOf(VerifyController);
  });

  it('should export VerifyService for use in other modules', () => {
    const exportedService = module.get<VerifyService>(VerifyService);
    expect(exportedService).toBe(verifyService);
  });
});
