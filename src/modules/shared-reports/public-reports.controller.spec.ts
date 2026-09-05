import { Test, TestingModule } from '@nestjs/testing';
import { PublicReportsController } from './public-reports.controller';
import { SharedReportsService } from './shared-reports.service';

describe('PublicReportsController', () => {
  let controller: PublicReportsController;
  let sharedReportsService: any;

  beforeEach(async () => {
    sharedReportsService = {
      getPublic: jest.fn(),
      verifyHash: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicReportsController],
      providers: [
        { provide: SharedReportsService, useValue: sharedReportsService },
      ],
    }).compile();

    controller = module.get<PublicReportsController>(PublicReportsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('view', () => {
    it('returns only the anonymised public report payload', () => {
      const payload = { reportType: 'INCOME_SUMMARY', data: {} };
      sharedReportsService.getPublic.mockReturnValue(payload);

      const result = controller.view('token-1');

      expect(sharedReportsService.getPublic).toHaveBeenCalledWith('token-1');
      expect(result).toEqual(payload);
    });
  });

  describe('verify', () => {
    it('verifies the report hash through the service', () => {
      sharedReportsService.verifyHash.mockReturnValue({ valid: true });

      const dto = { shareToken: 'token-1', verificationHash: 'abc' };

      expect(controller.verify(dto)).toEqual({ valid: true });
      expect(sharedReportsService.verifyHash).toHaveBeenCalledWith(
        'token-1',
        'abc',
      );
    });
  });
});
