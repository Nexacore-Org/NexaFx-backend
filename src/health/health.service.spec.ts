import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

const mockDataSource = {
  query: jest.fn(),
};

const mockQueue = {
  client: Promise.resolve({ ping: jest.fn() }),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    const config: Record<string, string> = {
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      STELLAR_HORIZON_URL: 'https://horizon.stellar.org',
      MAILGUN_API_KEY: 'test-key',
    };
    return config[key];
  }),
};

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getQueueToken('notifications'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  describe('checkReadiness', () => {
    it('should return ok status when all dependencies are up', async () => {
      mockDataSource.query.mockResolvedValue([{ '1': 1 }]);
      mockQueue.client = Promise.resolve({ ping: jest.fn().mockResolvedValue('PONG') });

      const result = await service.checkReadiness();

      expect(result.status).toBe('ok');
      expect(result.details.database).toBe('up');
      expect(result.details.redis).toBe('up');
    });

    it('should throw ServiceUnavailableException (503) when the database is down', async () => {
      mockDataSource.query.mockRejectedValue(new Error('connection refused'));
      mockQueue.client = Promise.resolve({ ping: jest.fn().mockResolvedValue('PONG') });

      await expect(service.checkReadiness()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should include database: down in the 503 body when the database is down', async () => {
      mockDataSource.query.mockRejectedValue(new Error('connection refused'));
      mockQueue.client = Promise.resolve({ ping: jest.fn().mockResolvedValue('PONG') });

      try {
        await service.checkReadiness();
        fail('expected ServiceUnavailableException');
      } catch (err) {
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        const body = (err as ServiceUnavailableException).getResponse() as any;
        expect(body.status).toBe('error');
        expect(body.details.database).toBe('down');
      }
    });

    it('should return 200 (ok) with stellar: down when only Stellar is down', async () => {
      mockDataSource.query.mockResolvedValue([{ '1': 1 }]);
      mockQueue.client = Promise.resolve({ ping: jest.fn().mockResolvedValue('PONG') });

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(new Error('horizon unreachable')) as any;

      try {
        const result = await service.checkReadiness();

        expect(result.status).toBe('ok');
        expect(result.details.stellar).toBe('down');
        expect(result.details.database).toBe('up');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should throw ServiceUnavailableException (503) when Redis is down', async () => {
      mockDataSource.query.mockResolvedValue([{ '1': 1 }]);
      mockQueue.client = Promise.reject(new Error('redis unreachable'));

      await expect(service.checkReadiness()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
