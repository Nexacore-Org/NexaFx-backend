import { Test, TestingModule } from '@nestjs/testing';
import { SharedReportsController } from './shared-reports.controller';
import { SharedReportsService } from './shared-reports.service';

describe('SharedReportsController', () => {
  let controller: SharedReportsController;
  let sharedReportsService: any;

  beforeEach(async () => {
    sharedReportsService = {
      generate: jest.fn(),
      listForUser: jest.fn(),
      deactivate: jest.fn(),
      extend: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SharedReportsController],
      providers: [
        { provide: SharedReportsService, useValue: sharedReportsService },
      ],
    }).compile();

    controller = module.get<SharedReportsController>(SharedReportsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('generate', () => {
    it('delegates the dto to the service', () => {
      sharedReportsService.generate.mockReturnValue({
        shareToken: 'token',
        shareUrl: 'url',
      });

      const dto = {
        userId: 'user-1',
        reportType: 'INCOME_SUMMARY',
        fromDate: '2026-01-01',
        toDate: '2026-01-31',
      };

      expect(controller.generate(dto)).toEqual({
        shareToken: 'token',
        shareUrl: 'url',
      });
      expect(sharedReportsService.generate).toHaveBeenCalledWith(dto);
    });
  });

  describe('list', () => {
    it('lists reports for the requested user id', () => {
      sharedReportsService.listForUser.mockReturnValue([{ id: 'r-1' }]);

      const result = controller.list('user-1');

      expect(sharedReportsService.listForUser).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([{ id: 'r-1' }]);
    });
  });

  describe('deactivate', () => {
    it('deactivates the report and confirms to the caller', () => {
      controller.deactivate('r-1');

      expect(sharedReportsService.deactivate).toHaveBeenCalledWith('r-1');
    });
  });

  describe('extend', () => {
    it('extends the report expiry via the service', () => {
      sharedReportsService.extend.mockReturnValue({ id: 'r-1' });

      const result = controller.extend('r-1');

      expect(sharedReportsService.extend).toHaveBeenCalledWith('r-1');
      expect(result).toEqual({ id: 'r-1' });
    });
  });
});
