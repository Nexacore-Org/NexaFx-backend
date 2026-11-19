import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  IdempotencyService,
  IdempotencyRedisCache,
} from './idempotency.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let cache: IdempotencyRedisCache;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyRedisCache,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        IdempotencyService,
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
    cache = module.get<IdempotencyRedisCache>(IdempotencyRedisCache);
  });

  describe('validateIdempotencyKey', () => {
    it('should reject missing key', () => {
      const result = service.validateIdempotencyKey('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject key over 128 characters', () => {
      const result = service.validateIdempotencyKey('a'.repeat(129));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('128 characters');
    });

    it('should reject invalid characters', () => {
      const result = service.validateIdempotencyKey('invalid!key@');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('alphanumeric');
    });

    it('should accept valid key with alphanumeric, hyphens, underscores', () => {
      const result = service.validateIdempotencyKey('valid_key-123-ABC');
      expect(result.valid).toBe(true);
    });
  });

  describe('generateRequestHash', () => {
    it('should generate consistent SHA-256 hash', () => {
      const body = { amount: 100, currency: 'XLM' };
      const hash1 = service.generateRequestHash(body);
      const hash2 = service.generateRequestHash(body);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('should generate different hashes for different bodies', () => {
      const hash1 = service.generateRequestHash({ amount: 100 });
      const hash2 = service.generateRequestHash({ amount: 200 });
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('concurrent duplicates', () => {
    it('reserves once and returns 409 for a concurrent duplicate while in progress', async () => {
      const body = { amount: 100 };
      const [a, b] = await Promise.allSettled([
        service.beginIdempotency('dup-key', 'user-1', body, 'POST /v2/transactions'),
        service.beginIdempotency('dup-key', 'user-1', body, 'POST /v2/transactions'),
      ]);

      const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
      const rejected = [a, b].filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect((fulfilled[0] as PromiseFulfilledResult<any>).value.state).toBe('proceed');
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        ConflictException,
      );
    });

    it('replays completed response after reservation is stored', async () => {
      const body = { amount: 100 };
      await service.beginIdempotency('replay-key', 'user-1', body, 'POST /v2/transactions');
      await service.storeIdempotency(
        'replay-key',
        'user-1',
        'POST /v2/transactions',
        201,
        { id: 'tx-1' },
        body,
      );

      const result = await service.beginIdempotency(
        'replay-key',
        'user-1',
        body,
        'POST /v2/transactions',
      );
      expect(result).toEqual({
        state: 'replay',
        statusCode: 201,
        body: { id: 'tx-1' },
        replayed: true,
      });
    });
  });

  describe('cache write failure', () => {
    it('propagates storage failure when completing the cached response', async () => {
      jest
        .spyOn(cache, 'complete')
        .mockRejectedValueOnce(new Error('cache down'));

      await expect(
        service.storeIdempotency(
          'key',
          'user-1',
          'POST /v2/transactions',
          201,
          { id: 'tx-1' },
          { amount: 1 },
        ),
      ).rejects.toThrow('cache down');
    });
  });
});
