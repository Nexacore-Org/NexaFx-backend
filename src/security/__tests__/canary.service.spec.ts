import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CanaryToken, CanaryType } from '../entities/canary-token.entity';
import { AlertService } from './alert.service';
import { CanaryService } from '../canary.service';

describe('CanaryService', () => {
  let service: CanaryService;
  let canaryRepo: Repository<CanaryToken>;
  let alertService: AlertService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CanaryService,
        {
          provide: getRepositoryToken(CanaryToken),
          useClass: Repository,
        },
        {
          provide: AlertService,
          useValue: {
            dispatchSuperAdminExfiltrationEmergency: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CanaryService>(CanaryService);
    canaryRepo = module.get<Repository<CanaryToken>>(
      getRepositoryToken(CanaryToken),
    );
    alertService = module.get<AlertService>(AlertService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('registerDynamicCanary', () => {
    it('should register a new canary token', async () => {
      const createSpy = jest
        .spyOn(canaryRepo, 'create')
        .mockReturnValue({} as CanaryToken);
      const saveSpy = jest
        .spyOn(canaryRepo, 'save')
        .mockResolvedValue({} as CanaryToken);

      const token = await service.registerDynamicCanary(
        CanaryType.USER_EXPORT,
        'email',
      );

      expect(token).toContain('@nexafx-trap.com');
      expect(createSpy).toHaveBeenCalled();
      expect(saveSpy).toHaveBeenCalled();
    });
  });

  describe('checkStringForCanaryTokens', () => {
    it('should trigger an alert if a canary token is found', async () => {
      const token = 'canary-test-token';
      const canary = { token } as CanaryToken;

      jest.spyOn(canaryRepo, 'findOne').mockResolvedValue(canary);
      const triggerSpy = jest
        .spyOn(service, 'triggerCanaryAlert')
        .mockResolvedValue(undefined);

      await service.checkStringForCanaryTokens(token, 'test-source');

      expect(triggerSpy).toHaveBeenCalledWith(canary, 'test-source');
    });
  });

  describe('triggerCanaryAlert', () => {
    it('should trigger a canary alert and dispatch a notification', async () => {
      const canary = new CanaryToken();
      canary.isTriggered = false;

      const saveSpy = jest.spyOn(canaryRepo, 'save').mockResolvedValue(canary);
      const dispatchSpy = jest
        .spyOn(alertService, 'dispatchSuperAdminExfiltrationEmergency')
        .mockResolvedValue(undefined);

      await service.triggerCanaryAlert(canary, 'test-source');

      expect(canary.isTriggered).toBe(true);
      expect(canary.triggeredAt).toBeInstanceOf(Date);
      expect(canary.triggeredBy).toBe('test-source');
      expect(saveSpy).toHaveBeenCalledWith(canary);
      expect(dispatchSpy).toHaveBeenCalledWith(canary, 'test-source');
    });
  });
});
