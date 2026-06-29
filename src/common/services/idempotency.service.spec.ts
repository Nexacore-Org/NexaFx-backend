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

  describe('checkEndpointMatch', () => {
    it('should return no cached entry for unknown key', async () => {
      const result = await service.checkEndpointMatch(
        'user-123',
        'unknown-key',
        'POST /test',
      );
      expect(result.match).toBe(true);
      expect(result.cached).toBeUndefined();
    });
  });
});

describe('IdempotencyRedisCache', () => {
  let cache: IdempotencyRedisCache;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyRedisCache,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('3600') },
        },
      ],
    }).compile();

    cache = module.get<IdempotencyRedisCache>(IdempotencyRedisCache);
  });

  it('should store and retrieve entries', async () => {
    const entry = {
      endpoint: 'POST /v2/transactions',
      statusCode: 201,
      body: { id: 'tx-123' },
    };

    await cache.set('user-123', 'key-123', entry);
    const result = await cache.get('user-123', 'key-123');

    expect(result).toBeDefined();
    expect(result?.endpoint).toBe('POST /v2/transactions');
    expect(result?.statusCode).toBe(201);
    expect(result?.body).toEqual({ id: 'tx-123' });
  });

  it('should return null for missing key', async () => {
    const result = await cache.get('user-123', 'missing-key');
    expect(result).toBeNull();
  });
});
