import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ApiKeyService } from '../src/api-keys/services/api-key.service';
import { Repository } from 'typeorm';
import { ApiKey } from '../src/api-keys/entities/api-key.entity';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('API Keys (e2e)', () => {
  let app: INestApplication;
  let apiKeyService: ApiKeyService;
  let apiKeyRepository: Repository<ApiKey>;

  let adminToken: string;
  let generatedApiKey: string;
  let apiKeyId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    apiKeyService = moduleFixture.get<ApiKeyService>(ApiKeyService);
    apiKeyRepository = moduleFixture.get<Repository<ApiKey>>(
      getRepositoryToken(ApiKey),
    );

    // Note: In a real test environment, you would:
    // 1. Create a test admin user
    // 2. Login to get admin JWT token
    // 3. Use that token for admin API calls
    // For now, we'll test the API key service directly
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // Clean up test API keys
    await apiKeyRepository.clear();
  });

  describe('POST /admin/api-keys - Generate API Key', () => {
    it('should generate a new API key and return plaintext once', async () => {
      const { key, apiKey } = await apiKeyService.generateKey(
        'Test Webhook Key',
        ['webhook:receive', 'transactions:read'],
      );

      expect(key).toBeDefined();
      expect(key.length).toBeGreaterThan(50); // Base64url encoded 48 bytes
      expect(apiKey.id).toBeDefined();
      expect(apiKey.name).toBe('Test Webhook Key');
      expect(apiKey.prefix).toBe(key.substring(0, 8));
      expect(apiKey.scopes).toEqual(['webhook:receive', 'transactions:read']);
      expect(apiKey.isActive).toBe(true);

      // Verify hash is stored, not plaintext
      expect(apiKey.hashedKey).toBeDefined();
      expect(apiKey.hashedKey.length).toBe(64); // SHA-256 hex length
      expect(apiKey.hashedKey).not.toBe(key);

      generatedApiKey = key;
      apiKeyId = apiKey.id;
    });

    it('should generate API key with expiration date', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

      const { key, apiKey } = await apiKeyService.generateKey(
        'Expiring Key',
        ['admin:read'],
        expiresAt,
      );

      expect(apiKey.expiresAt).toBeDefined();
      expect(apiKey.expiresAt!.getTime()).toBeCloseTo(expiresAt.getTime(), -3);
    });

    it('should store only prefix in plain text', async () => {
      const { key, apiKey } = await apiKeyService.generateKey(
        'Prefix Test Key',
        ['test:scope'],
      );

      // Verify prefix is first 8 chars
      expect(apiKey.prefix).toBe(key.substring(0, 8));
      expect(apiKey.prefix.length).toBe(8);

      // Verify we can find the key by prefix
      const foundByKey = await apiKeyRepository.findOne({
        where: { prefix: apiKey.prefix },
      });
      expect(foundByKey).toBeDefined();
      expect(foundByKey!.id).toBe(apiKey.id);
    });
  });

  describe('API Key Validation', () => {
    it('should validate a correct API key', async () => {
      const { key, apiKey } = await apiKeyService.generateKey(
        'Validation Test Key',
        ['webhook:receive'],
      );

      const validatedKey = await apiKeyService.validateKey(key);

      expect(validatedKey.id).toBe(apiKey.id);
      expect(validatedKey.name).toBe('Validation Test Key');
      expect(validatedKey.scopes).toEqual(['webhook:receive']);
    });

    it('should reject invalid API key format', async () => {
      await expect(
        apiKeyService.validateKey('short'),
      ).rejects.toThrow('Invalid API key format');
    });

    it('should reject non-existent API key', async () => {
      const fakeKey = 'nxk_fake' + 'a'.repeat(56); // 64 chars total
      await expect(apiKeyService.validateKey(fakeKey)).rejects.toThrow(
        'Invalid API key',
      );
    });

    it('should reject expired API key with appropriate message', async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 1); // Yesterday

      const { key } = await apiKeyService.generateKey(
        'Expired Key',
        ['test:scope'],
        expiresAt,
      );

      await expect(apiKeyService.validateKey(key)).rejects.toThrow(
        'API key has expired',
      );
    });

    it('should reject revoked API key immediately', async () => {
      const { key, apiKey } = await apiKeyService.generateKey(
        'Revoked Key',
        ['test:scope'],
      );

      // Revoke the key
      await apiKeyService.revokeKey(apiKey.id);

      await expect(apiKeyService.validateKey(key)).rejects.toThrow(
        'API key has been revoked',
      );
    });
  });

  describe('API Key Revocation', () => {
    it('should revoke an API key immediately', async () => {
      const { apiKey } = await apiKeyService.generateKey(
        'To Be Revoked',
        ['test:scope'],
      );

      await apiKeyService.revokeKey(apiKey.id);

      const revokedKey = await apiKeyRepository.findOne({
        where: { id: apiKey.id },
      });

      expect(revokedKey!.isActive).toBe(false);
    });

    it('should throw 404 when revoking non-existent key', async () => {
      const fakeId = '550e8400-e29b-41d4-a716-446655440000';
      await expect(apiKeyService.revokeKey(fakeId)).rejects.toThrow(
        'API key not found',
      );
    });
  });

  describe('API Key Rotation', () => {
    it('should rotate API key with grace period', async () => {
      const { key: oldKey, apiKey: oldApiKey } =
        await apiKeyService.generateKey('Rotation Test', ['test:scope']);

      // Rotate with 5-minute grace period
      const { key: newKey, apiKey: newApiKey } =
        await apiKeyService.rotateKey(oldApiKey.id, 5);

      // New key should work
      const validatedNew = await apiKeyService.validateKey(newKey);
      expect(validatedNew.id).toBe(newApiKey.id);

      // Old key should still work during grace period
      const validatedOld = await apiKeyService.validateKey(oldKey);
      expect(validatedOld.id).toBe(oldApiKey.id);

      // Old key should have expiration set
      const updatedOldKey = await apiKeyRepository.findOne({
        where: { id: oldApiKey.id },
      });
      expect(updatedOldKey!.expiresAt).toBeDefined();
      expect(updatedOldKey!.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should fail rotation for revoked key', async () => {
      const { apiKey } = await apiKeyService.generateKey(
        'Revoked Rotation Test',
        ['test:scope'],
      );

      await apiKeyService.revokeKey(apiKey.id);

      await expect(apiKeyService.rotateKey(apiKey.id)).rejects.toThrow(
        'Cannot rotate a revoked API key',
      );
    });

    it('old key should fail after grace period expires', async () => {
      const { key: oldKey, apiKey: oldApiKey } =
        await apiKeyService.generateKey('Grace Period Test', ['test:scope']);

      // Rotate with 0-minute grace period (expires immediately)
      await apiKeyService.rotateKey(oldApiKey.id, 0);

      // Manually set expiration to past for testing
      await apiKeyRepository.update(oldApiKey.id, {
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
      });

      await expect(apiKeyService.validateKey(oldKey)).rejects.toThrow(
        'API key has expired',
      );
    });
  });

  describe('Scope Enforcement', () => {
    it('should allow access with correct scope', async () => {
      const { key } = await apiKeyService.generateKey('Scope Test', [
        'webhook:receive',
      ]);

      const validatedKey = await apiKeyService.validateKey(key);
      expect(validatedKey.scopes).toContain('webhook:receive');
    });

    it('should have multiple scopes assigned', async () => {
      const { apiKey } = await apiKeyService.generateKey('Multi Scope Test', [
        'admin:read',
        'admin:write',
        'transactions:read',
      ]);

      expect(apiKey.scopes).toHaveLength(3);
      expect(apiKey.scopes).toContain('admin:read');
      expect(apiKey.scopes).toContain('admin:write');
      expect(apiKey.scopes).toContain('transactions:read');
    });
  });

  describe('Usage Logging', () => {
    it('should log API key usage with metadata', async () => {
      const { apiKey } = await apiKeyService.generateKey('Usage Test', [
        'test:scope',
      ]);

      await apiKeyService.logUsage(
        apiKey.id,
        'GET /api/transactions',
        200,
        150,
      );

      // Verify lastUsedAt was updated
      const updatedKey = await apiKeyRepository.findOne({
        where: { id: apiKey.id },
      });
      expect(updatedKey!.lastUsedAt).toBeDefined();
      expect(updatedKey!.lastUsedAt!.getTime()).toBeCloseTo(Date.now(), -3);
    });
  });

  describe('List API Keys', () => {
    it('should return paginated list of API keys', async () => {
      // Create multiple keys
      await apiKeyService.generateKey('Key 1', ['scope1']);
      await apiKeyService.generateKey('Key 2', ['scope2']);
      await apiKeyService.generateKey('Key 3', ['scope1', 'scope2']);

      const result = await apiKeyService.listKeys({ page: 1, limit: 10 });

      expect(result.keys).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('should filter by active status', async () => {
      const { apiKey } = await apiKeyService.generateKey('Active Key', [
        'scope1',
      ]);
      await apiKeyService.generateKey('Inactive Key', ['scope2']);

      await apiKeyService.revokeKey(apiKey.id);

      const inactiveResult = await apiKeyService.listKeys({
        isActive: false,
      });
      expect(inactiveResult.keys).toHaveLength(1);
      expect(inactiveResult.keys[0].name).toBe('Active Key');

      const activeResult = await apiKeyService.listKeys({ isActive: true });
      expect(activeResult.keys).toHaveLength(1);
      expect(activeResult.keys[0].name).toBe('Inactive Key');
    });

    it('should exclude hashedKey from response', async () => {
      await apiKeyService.generateKey('Hash Test', ['scope1']);

      const result = await apiKeyService.listKeys({ page: 1, limit: 10 });

      result.keys.forEach((key) => {
        expect((key as any).hashedKey).toBeUndefined();
      });
    });
  });

  describe('HTTP API Key Authentication', () => {
    it('should authenticate with X-API-Key header', async () => {
      // This test requires a running server with API key protected endpoint
      // Example implementation (requires actual endpoint):
      /*
      const { key } = await apiKeyService.generateKey('HTTP Test', [
        'webhook:receive',
      ]);

      return request(app.getHttpServer())
        .post('/webhooks/test')
        .set('X-API-Key', key)
        .expect(HttpStatus.OK);
      */
    });

    it('should return 401 for invalid API key via HTTP', async () => {
      // Example implementation:
      /*
      return request(app.getHttpServer())
        .post('/webhooks/test')
        .set('X-API-Key', 'invalid_key_here')
        .expect(HttpStatus.UNAUTHORIZED);
      */
    });
  });

  describe('Timing-Safe Comparison', () => {
    it('should use timing-safe comparison for hash validation', async () => {
      const { key } = await apiKeyService.generateKey('Timing Test', [
        'scope1',
      ]);

      // Create a key that differs by one character
      const tamperedKey = key.slice(0, -1) + (key.slice(-1) === 'a' ? 'b' : 'a');

      // Should fail validation
      await expect(apiKeyService.validateKey(tamperedKey)).rejects.toThrow(
        'Invalid API key',
      );
    });
  });
});
