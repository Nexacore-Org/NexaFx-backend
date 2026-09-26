import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { MerchantApiKeyGuard } from './merchant-api-key.guard';
import { MerchantApiKey } from '../entities/merchant-api-key.entity';

const mockApiKeyRepo = () => ({
  findOne: jest.fn(),
  save: jest.fn(),
});

const makeExecutionContext = (headers: Record<string, string | undefined>) => ({
  switchToHttp: () => ({
    getRequest: () => ({ headers }),
  }),
});

const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

describe('MerchantApiKeyGuard', () => {
  let guard: MerchantApiKeyGuard;
  let apiKeyRepo: ReturnType<typeof mockApiKeyRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantApiKeyGuard,
        {
          provide: getRepositoryToken(MerchantApiKey),
          useFactory: mockApiKeyRepo,
        },
      ],
    }).compile();

    guard = module.get<MerchantApiKeyGuard>(MerchantApiKeyGuard);
    apiKeyRepo = module.get(getRepositoryToken(MerchantApiKey));
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate()', () => {
    it('throws UnauthorizedException when no API key header is provided', async () => {
      const ctx = makeExecutionContext({}) as any;

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(ctx)).rejects.toThrow(
        'API key is missing',
      );
    });

    it('throws UnauthorizedException when API key is not found in DB', async () => {
      const rawKey = 'my-raw-api-key';
      const ctx = makeExecutionContext({
        'x-api-key': rawKey,
      }) as any;

      apiKeyRepo.findOne.mockResolvedValue(null);

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when API key is inactive', async () => {
      const rawKey = 'inactive-key';
      const keyHash = sha256(rawKey);
      const ctx = makeExecutionContext({ 'x-api-key': rawKey }) as any;

      apiKeyRepo.findOne.mockResolvedValue(null); // isActive filter excludes it

      await expect(guard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(apiKeyRepo.findOne).toHaveBeenCalledWith({
        where: { keyHash, isActive: true },
      });
    });

    it('returns true and sets request.merchantId when key is valid', async () => {
      const rawKey = 'valid-api-key';
      const keyHash = sha256(rawKey);
      const request: any = { headers: { 'x-api-key': rawKey } };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as any;

      const apiKey: MerchantApiKey = {
        id: 'key-1',
        merchantId: 'merchant-42',
        keyHash,
        isActive: true,
        scopes: [],
        lastUsedAt: null,
        createdAt: new Date(),
      } as MerchantApiKey;

      apiKeyRepo.findOne.mockResolvedValue(apiKey);
      apiKeyRepo.save.mockResolvedValue({ ...apiKey, lastUsedAt: new Date() });

      const allowed = await guard.canActivate(ctx);

      expect(allowed).toBe(true);
      expect(request.merchantId).toBe('merchant-42');
    });

    it('updates lastUsedAt on successful authentication', async () => {
      const rawKey = 'valid-api-key';
      const request: any = { headers: { 'x-api-key': rawKey } };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as any;

      const apiKey = {
        id: 'key-1',
        merchantId: 'merchant-1',
        keyHash: sha256(rawKey),
        isActive: true,
        lastUsedAt: null,
        scopes: [],
        createdAt: new Date(),
      } as MerchantApiKey;

      apiKeyRepo.findOne.mockResolvedValue(apiKey);
      apiKeyRepo.save.mockResolvedValue(apiKey);

      await guard.canActivate(ctx);

      expect(apiKeyRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          lastUsedAt: expect.any(Date),
        }),
      );
    });

    it('strips Bearer prefix from Authorization header', async () => {
      const rawKey = 'raw-bearer-key';
      const keyHash = sha256(rawKey);
      const request: any = {
        headers: { authorization: `Bearer ${rawKey}` },
      };
      const ctx = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as any;

      const apiKey = {
        id: 'key-2',
        merchantId: 'merchant-99',
        keyHash,
        isActive: true,
        scopes: [],
        lastUsedAt: null,
        createdAt: new Date(),
      } as MerchantApiKey;

      apiKeyRepo.findOne.mockResolvedValue(apiKey);
      apiKeyRepo.save.mockResolvedValue(apiKey);

      const allowed = await guard.canActivate(ctx);

      expect(allowed).toBe(true);
      expect(apiKeyRepo.findOne).toHaveBeenCalledWith({
        where: { keyHash, isActive: true },
      });
    });
  });
});
