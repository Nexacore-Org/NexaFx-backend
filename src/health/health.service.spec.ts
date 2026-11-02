jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

jest.mock('@nestjs/bullmq', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Inject } = require('@nestjs/common');
  const getQueueToken = (name: string) => `BullQueue_${name}`;
  return {
    InjectQueue: (name: string) => Inject(getQueueToken(name)),
    getQueueToken,
    Processor: () => () => undefined,
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthCheckError } from '@nestjs/terminus';
import { DataSource } from 'typeorm';
import { HealthService } from './health.service';
import { RedisHealthIndicator } from './indicators/redis-health.indicator';
import { StellarHealthIndicator } from './indicators/stellar-health.indicator';
import { BullMQHealthIndicator } from './indicators/bullmq-health.indicator';
import { MailgunHealthIndicator } from './indicators/mailgun-health.indicator';
import { REDIS_CLIENT } from '../modules/redis/redis.constants';
import { EMAIL_QUEUE } from '../modules/queues/queue.constants';

describe('HealthService & Indicators (#1528)', () => {
  let service: HealthService;
  let redisIndicator: RedisHealthIndicator;
  let bullmqIndicator: BullMQHealthIndicator;
  let stellarIndicator: { isHealthy: jest.Mock };
  let mailgunIndicator: { isHealthy: jest.Mock };
  let mockDataSource: { isInitialized: boolean; query: jest.Mock };
  let sharedRedisClient: {
    status: string;
    ping: jest.Mock;
    connect: jest.Mock;
    quit: jest.Mock;
  };
  let bullmqQueueClient: {
    status: string;
    ping: jest.Mock;
  };
  let mockEmailQueue: {
    client: Promise<{ status: string; ping: jest.Mock }>;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockDataSource = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ '1': 1 }]),
    };

    sharedRedisClient = {
      status: 'ready',
      ping: jest.fn().mockResolvedValue('PONG'),
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue('OK'),
    };

    bullmqQueueClient = {
      status: 'ready',
      ping: jest.fn().mockResolvedValue('PONG'),
    };

    mockEmailQueue = {
      client: Promise.resolve(bullmqQueueClient),
    };

    stellarIndicator = {
      isHealthy: jest.fn().mockResolvedValue({ status: 'up' }),
    };

    mailgunIndicator = {
      isHealthy: jest.fn().mockResolvedValue({
        mailgun: { status: 'up', critical: false },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        RedisHealthIndicator,
        BullMQHealthIndicator,
        { provide: DataSource, useValue: mockDataSource },
        { provide: REDIS_CLIENT, useValue: sharedRedisClient },
        {
          provide: `BullQueue_${EMAIL_QUEUE}`,
          useValue: mockEmailQueue,
        },
        { provide: StellarHealthIndicator, useValue: stellarIndicator },
        { provide: MailgunHealthIndicator, useValue: mailgunIndicator },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    redisIndicator = module.get<RedisHealthIndicator>(RedisHealthIndicator);
    bullmqIndicator = module.get<BullMQHealthIndicator>(BullMQHealthIndicator);
  });

  describe('checkReadiness', () => {
    it('includes mailgun and degraded=false when all dependencies are healthy', async () => {
      const result = await service.checkReadiness();

      expect(result).toEqual({
        status: 'ok',
        degraded: false,
        details: {
          database: 'ok',
          redis: 'up',
          stellar: 'up',
          bullmq: 'up',
          mailgun: 'up',
        },
      });
    });

    it('keeps readiness 200 (status: ok) with degraded=true and mailgun: down when Mailgun is down', async () => {
      mailgunIndicator.isHealthy.mockRejectedValueOnce(
        new HealthCheckError('Mailgun unreachable', {
          mailgun: {
            status: 'down',
            critical: false,
            message: 'Mailgun responded with 503',
          },
        }),
      );

      const result = await service.checkReadiness();

      expect(result.status).toBe('ok');
      expect(result.degraded).toBe(true);
      expect(result.details.mailgun).toBe('down');
      expect(result.details.database).toBe('ok');
      expect(result.details.redis).toBe('up');
      expect(result.details.bullmq).toBe('up');
    });

    it('keeps readiness 200 (status: ok) with degraded=true and stellar: down when Stellar is down', async () => {
      stellarIndicator.isHealthy.mockResolvedValueOnce({ status: 'down' });

      const result = await service.checkReadiness();

      expect(result.status).toBe('ok');
      expect(result.degraded).toBe(true);
      expect(result.details.stellar).toBe('down');
      expect(result.details.mailgun).toBe('up');
    });

    it('throws ServiceUnavailableException (503) when the database is down', async () => {
      mockDataSource.query.mockRejectedValueOnce(
        new Error('connection refused'),
      );

      try {
        await service.checkReadiness();
        fail('expected ServiceUnavailableException');
      } catch (err) {
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        const body = (err as ServiceUnavailableException).getResponse() as any;
        expect(body.status).toBe('error');
        expect(body.details.database).toBe('error');
        expect(body.details.mailgun).toBe('up');
      }
    });

    it('throws ServiceUnavailableException (503) when Redis is down', async () => {
      sharedRedisClient.ping.mockRejectedValueOnce(
        new Error('redis unreachable'),
      );

      await expect(service.checkReadiness()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws ServiceUnavailableException (503) when BullMQ Redis is down', async () => {
      bullmqQueueClient.ping.mockRejectedValueOnce(
        new Error('bullmq redis unreachable'),
      );

      await expect(service.checkReadiness()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('Shared Redis connection reuse & missing REDIS_URL handling', () => {
    it('reuses the shared REDIS_CLIENT and BullMQ queue connection across repeated probes without quitting or opening new connections', async () => {
      const originalRedisUrl = process.env.REDIS_URL;
      delete process.env.REDIS_URL;

      try {
        await service.checkReadiness();
        await service.checkReadiness();
        await service.checkReadiness();

        expect(sharedRedisClient.ping).toHaveBeenCalledTimes(3);
        expect(bullmqQueueClient.ping).toHaveBeenCalledTimes(3);
        expect(sharedRedisClient.quit).not.toHaveBeenCalled();

        const redisResult = await redisIndicator.isHealthy();
        const bullmqResult = await bullmqIndicator.isHealthy();
        expect(redisResult.status).toBe('up');
        expect(bullmqResult.status).toBe('up');
      } finally {
        if (originalRedisUrl !== undefined) {
          process.env.REDIS_URL = originalRedisUrl;
        }
      }
    });
  });
});
