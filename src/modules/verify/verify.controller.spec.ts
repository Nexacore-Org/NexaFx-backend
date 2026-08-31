import { Test, TestingModule } from '@nestjs/testing';
import { VerifyController } from './verify.controller';
import { VerifyService } from './verify.service';
import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

describe('VerifyController', () => {
  let controller: VerifyController;
  let verifyService: jest.Mocked<VerifyService>;

  const mockVerifyService = {
    verify: jest.fn(),
    verifyBatch: jest.fn(),
  };

  const mockJwtAuthGuard = {
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest();
      req.user = { userId: 'user-1' };
      return true;
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VerifyController],
      providers: [{ provide: VerifyService, useValue: mockVerifyService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    controller = module.get<VerifyController>(VerifyController);
    verifyService = module.get(VerifyService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET :txHash', () => {
    it('calls verifyService.verify with the provided txHash', async () => {
      const mockResult = {
        hash: 'abc123',
        status: 'SUCCESS',
        timestamp: '2026-08-01T12:00:00Z',
        fee: '0.0000100 XLM',
        ledger: 12345,
        operations: [],
        summary: 'Stellar transaction',
        nexafxLinked: false,
        nexafxReference: null,
        explorerUrl: 'https://stellar.expert/explorer/testnet/tx/abc123',
      };
      verifyService.verify.mockResolvedValue(mockResult);

      const result = await controller.verify('abc123');

      expect(verifyService.verify).toHaveBeenCalledWith('abc123');
      expect(result).toEqual(mockResult);
    });
  });

  describe('POST batch', () => {
    it('calls verifyService.verifyBatch with the provided hashes', async () => {
      const mockResults = [
        { hash: 'h1', status: 'SUCCESS' },
        { hash: 'h2', status: 'FAILED' },
      ];
      verifyService.verifyBatch.mockResolvedValue(mockResults as any);

      const result = await controller.verifyBatch({ hashes: ['h1', 'h2'] });

      expect(verifyService.verifyBatch).toHaveBeenCalledWith(['h1', 'h2']);
      expect(result).toHaveLength(2);
    });
  });

  describe('route metadata', () => {
    it('controller is decorated with @Controller("v2/verify/stellar")', () => {
      const metadata = Reflect.getMetadata('path', VerifyController);
      expect(metadata).toBe('v2/verify/stellar');
    });
  });
});
