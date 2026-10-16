import { Test, TestingModule } from '@nestjs/testing';
import { IntelligentSmsRoutingService } from './intelligent-sms-routing.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SmsProviderRoute } from './entities/sms-provider-route.entity';
import { Repository } from 'typeorm';

describe('IntelligentSmsRoutingService', () => {
  let service: IntelligentSmsRoutingService;
  let repository: Repository<SmsProviderRoute>;

  const mockRepository = {
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntelligentSmsRoutingService,
        {
          provide: getRepositoryToken(SmsProviderRoute),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<IntelligentSmsRoutingService>(
      IntelligentSmsRoutingService,
    );
    repository = module.get<Repository<SmsProviderRoute>>(
      getRepositoryToken(SmsProviderRoute),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendSms - Routing and Failover', () => {
    it('should route via primary provider successfully', async () => {
      const mockRoutes = [
        {
          id: '1',
          countryCode: '+234',
          providerName: 'twilio',
          priority: 0,
          isActive: true,
        },
        {
          id: '2',
          countryCode: '+234',
          providerName: 'infobip',
          priority: 1,
          isActive: true,
        },
      ];

      // repository.find is called first with prefixes (+2348, +234, etc.)
      mockRepository.find
        .mockResolvedValueOnce([]) // +2348
        .mockResolvedValueOnce(mockRoutes); // +234

      service.setProviderHealth('twilio', true);

      await expect(
        service.sendSms('+2348012345678', 'Hello'),
      ).resolves.not.toThrow();
    });

    it('should failover to secondary provider if primary fails', async () => {
      const mockRoutes = [
        {
          id: '1',
          countryCode: '+234',
          providerName: 'twilio',
          priority: 0,
          isActive: true,
        },
        {
          id: '2',
          countryCode: '+234',
          providerName: 'infobip',
          priority: 1,
          isActive: true,
        },
      ];

      mockRepository.find
        .mockResolvedValueOnce([]) // +2348
        .mockResolvedValueOnce(mockRoutes); // +234

      // twilio is down, infobip is healthy
      service.setProviderHealth('twilio', false);
      service.setProviderHealth('infobip', true);

      await expect(
        service.sendSms('+2348012345678', 'Hello'),
      ).resolves.not.toThrow();
    });

    it('should fallback to default route if prefix not found', async () => {
      const mockDefaultRoutes = [
        {
          id: '3',
          countryCode: 'default',
          providerName: 'messagebird',
          priority: 0,
          isActive: true,
        },
      ];

      mockRepository.find
        .mockResolvedValueOnce([]) // +4412
        .mockResolvedValueOnce([]) // +441
        .mockResolvedValueOnce([]) // +44
        .mockResolvedValueOnce([]) // +4
        .mockResolvedValueOnce(mockDefaultRoutes); // default fallback

      service.setProviderHealth('messagebird', true);

      await expect(
        service.sendSms('+44123456789', 'Hello'),
      ).resolves.not.toThrow();
    });

    it('should throw if all providers fail', async () => {
      const mockRoutes = [
        {
          id: '1',
          countryCode: '+1',
          providerName: 'twilio',
          priority: 0,
          isActive: true,
        },
      ];

      mockRepository.find
        .mockResolvedValueOnce([]) // +1555
        .mockResolvedValueOnce([]) // +155
        .mockResolvedValueOnce([]) // +15
        .mockResolvedValueOnce(mockRoutes); // +1

      service.setProviderHealth('twilio', false);

      await expect(service.sendSms('+15551234567', 'Hello')).rejects.toThrow(
        'All SMS providers failed to deliver',
      );
    });

    it('should call the adapter with the recipient and body', async () => {
      const mockRoutes = [
        {
          id: '1',
          countryCode: '+234',
          providerName: 'twilio',
          priority: 0,
          isActive: true,
        },
      ];

      mockRepository.find
        .mockResolvedValueOnce([]) // +2348
        .mockResolvedValueOnce(mockRoutes); // +234

      const adapter = { send: jest.fn().mockResolvedValue(undefined) };
      service.registerProvider('twilio', adapter);
      service.setProviderHealth('twilio', true);

      await service.sendSms('+2348012345678', 'Your code is 123456');

      expect(adapter.send).toHaveBeenCalledWith(
        '+2348012345678',
        'Your code is 123456',
      );
    });

    it('should failover to the next route when the adapter throws', async () => {
      const mockRoutes = [
        {
          id: '1',
          countryCode: '+234',
          providerName: 'twilio',
          priority: 0,
          isActive: true,
        },
        {
          id: '2',
          countryCode: '+234',
          providerName: 'infobip',
          priority: 1,
          isActive: true,
        },
      ];

      mockRepository.find
        .mockResolvedValueOnce([]) // +2348
        .mockResolvedValueOnce(mockRoutes); // +234

      const failing = {
        send: jest.fn().mockRejectedValue(new Error('twilio down')),
      };
      const healthy = { send: jest.fn().mockResolvedValue(undefined) };

      service.registerProvider('twilio', failing);
      service.registerProvider('infobip', healthy);
      service.setProviderHealth('twilio', true);
      service.setProviderHealth('infobip', true);

      await service.sendSms('+2348012345678', 'Your code is 123456');

      expect(failing.send).toHaveBeenCalled();
      expect(healthy.send).toHaveBeenCalledWith(
        '+2348012345678',
        'Your code is 123456',
      );
    });

    it('should not log the OTP body or full phone number', async () => {
      const mockRoutes = [
        {
          id: '1',
          countryCode: '+234',
          providerName: 'twilio',
          priority: 0,
          isActive: true,
        },
      ];

      mockRepository.find
        .mockResolvedValueOnce([]) // +2348
        .mockResolvedValueOnce(mockRoutes); // +234

      const adapter = { send: jest.fn().mockResolvedValue(undefined) };
      service.registerProvider('twilio', adapter);
      service.setProviderHealth('twilio', true);

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await service.sendSms('+2348012345678', 'Your code is 123456');

      const logged = [...logSpy.mock.calls, ...errorSpy.mock.calls]
        .flat()
        .join(' ');

      expect(logged).not.toContain('123456');
      expect(logged).not.toContain('+2348012345678');

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should mark a provider unhealthy after N consecutive failures and skip it until cool-down', async () => {
      const mockRoutes = [
        {
          id: '1',
          countryCode: '+234',
          providerName: 'twilio',
          priority: 0,
          isActive: true,
        },
        {
          id: '2',
          countryCode: '+234',
          providerName: 'infobip',
          priority: 1,
          isActive: true,
        },
      ];

      const failing = {
        send: jest.fn().mockRejectedValue(new Error('twilio down')),
      };
      const healthy = { send: jest.fn().mockResolvedValue(undefined) };

      service.registerProvider('twilio', failing);
      service.registerProvider('infobip', healthy);
      service.setProviderHealth('twilio', true);
      service.setProviderHealth('infobip', true);

      // Trip the circuit breaker with consecutive failures.
      for (let i = 0; i < 5; i++) {
        mockRepository.find
          .mockResolvedValueOnce([]) // +2348
          .mockResolvedValueOnce(mockRoutes); // +234
        await service.sendSms('+2348012345678', 'Your code is 123456');
      }

      const callsBefore = failing.send.mock.calls.length;

      mockRepository.find
        .mockResolvedValueOnce([]) // +2348
        .mockResolvedValueOnce(mockRoutes); // +234

      await service.sendSms('+2348012345678', 'Your code is 123456');

      // Unhealthy provider is skipped, so no additional adapter call.
      expect(failing.send.mock.calls.length).toBe(callsBefore);
      expect(healthy.send).toHaveBeenCalled();
    });
  });
});
