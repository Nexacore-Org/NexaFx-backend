import { Test, TestingModule } from '@nestjs/testing';
import { GdprController } from './gdpr.controller';
import { GdprService } from './gdpr.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

describe('GdprController', () => {
  let controller: GdprController;
  let service: {
    eraseUser: jest.Mock;
    requestExport: jest.Mock;
    getExportStatus: jest.Mock;
    getConsentStatus: jest.Mock;
    updateConsent: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      eraseUser: jest.fn(),
      requestExport: jest.fn(),
      getExportStatus: jest.fn(),
      getConsentStatus: jest.fn(),
      updateConsent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GdprController],
      providers: [{ provide: GdprService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(GdprController);
  });

  afterEach(() => jest.clearAllMocks());

  it('requestErasure delegates password and reason', async () => {
    service.eraseUser.mockResolvedValue({ filesDeleted: 2, status: 'erased' });
    const req = { user: { userId: 'u1' } } as any;
    const result = await controller.requestErasure(req, {
      password: 'secret',
      reason: 'leaving',
    });
    expect(service.eraseUser).toHaveBeenCalledWith('u1', 'secret', 'leaving');
    expect(result).toEqual(
      expect.objectContaining({ status: 'erased', filesDeleted: 2 }),
    );
  });

  it('requestExport returns job id', async () => {
    service.requestExport.mockResolvedValue('job-99');
    const req = { user: { userId: 'u1' } } as any;
    const result = await controller.requestExport(req);
    expect(result.jobId).toBe('job-99');
  });

  it('getExportStatus delegates', async () => {
    service.getExportStatus.mockResolvedValue({ status: 'completed', jobId: 'j1' });
    const req = { user: { userId: 'u1' } } as any;
    await expect(controller.getExportStatus(req)).resolves.toEqual({
      status: 'completed',
      jobId: 'j1',
    });
  });

  it('getConsentStatus delegates', async () => {
    service.getConsentStatus.mockResolvedValue({
      requiresConsentUpdate: true,
      currentVersion: null,
      requiredVersion: '2.0',
    });
    const req = { user: { userId: 'u1' } } as any;
    await expect(controller.getConsentStatus(req)).resolves.toEqual(
      expect.objectContaining({ requiresConsentUpdate: true }),
    );
  });

  it('updateConsent passes ip and user-agent', async () => {
    service.updateConsent.mockResolvedValue(undefined);
    const req = {
      user: { userId: 'u1' },
      ip: '9.9.9.9',
      get: jest.fn().mockReturnValue('TestAgent'),
    } as any;
    await controller.updateConsent(req, { consentGdpr: true });
    expect(service.updateConsent).toHaveBeenCalledWith('u1', '9.9.9.9', 'TestAgent');
  });
});
