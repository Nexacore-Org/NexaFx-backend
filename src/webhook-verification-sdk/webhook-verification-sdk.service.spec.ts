import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { WebhookVerificationSdkService } from './webhook-verification-sdk.service';
import { WebhookVerification } from './entities/webhook-verification.entity';
import {
  WEBHOOK_SIGNATURE_SCHEME,
} from './webhook-verification-sdk.constants';

const SECRET = 'test-endpoint-secret-c7f8f1a3b2c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2';
const PAYLOAD = JSON.stringify({
  id: 'evt_123',
  type: 'transaction.completed',
  createdAt: '2026-09-24T00:00:00.000Z',
});

function sign(payload: string, secret: string): string {
  return `sha256=${crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')}`;
}

describe('WebhookVerificationSdkService', () => {
  let service: WebhookVerificationSdkService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn((v) => v),
      save: jest.fn((v) =>
        Promise.resolve({ ...v, id: 'ver-0001', createdAt: new Date('2026-09-24T12:00:00Z') }),
      ),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookVerificationSdkService,
        { provide: getRepositoryToken(WebhookVerification), useValue: repo },
      ],
    }).compile();

    service = module.get(WebhookVerificationSdkService);
  });

  describe('verifySignature', () => {
    it('accepts a genuinely signed payload', () => {
      expect(service.verifySignature(PAYLOAD, sign(PAYLOAD, SECRET), SECRET)).toBe(
        true,
      );
    });

    it('rejects a tampered payload even though the header is well-formed', () => {
      const tampered = PAYLOAD.replace('transaction.completed', 'transaction.failed');
      expect(
        service.verifySignature(tampered, sign(PAYLOAD, SECRET), SECRET),
      ).toBe(false);
    });

    it('rejects a signature produced with the wrong secret', () => {
      expect(
        service.verifySignature(PAYLOAD, sign(PAYLOAD, 'another-secret'), SECRET),
      ).toBe(false);
    });

    it('rejects a missing header, a non-sha256 scheme, and a malformed digest', () => {
      expect(service.verifySignature(PAYLOAD, '', SECRET)).toBe(false);
      expect(service.verifySignature(PAYLOAD, 'hmac=deadbeef', SECRET)).toBe(false);
      expect(service.verifySignature(PAYLOAD, 'sha256=nothex!!!', SECRET)).toBe(false);
      expect(service.verifySignature(PAYLOAD, 'sha256=abc', SECRET)).toBe(false);
    });

    it('rejects an uppercase hex digest (the scheme is lowercase hex)', () => {
      const upper = sign(PAYLOAD, SECRET).toUpperCase();
      expect(service.verifySignature(PAYLOAD, upper, SECRET)).toBe(false);
    });

    it('rejects an empty payload and an empty secret', () => {
      expect(service.verifySignature('', sign(PAYLOAD, SECRET), SECRET)).toBe(false);
      expect(service.verifySignature(PAYLOAD, sign(PAYLOAD, SECRET), '')).toBe(false);
    });

    it('verifies a Buffer payload identically to its string form', () => {
      const header = sign(PAYLOAD, SECRET);
      expect(service.verifySignature(Buffer.from(PAYLOAD, 'utf8'), header, SECRET)).toBe(
        true,
      );
    });
  });

  describe('verify', () => {
    it('persists a valid verification and returns the outcome', async () => {
      const result = await service.verify({
        payload: PAYLOAD,
        signature: sign(PAYLOAD, SECRET),
        secret: SECRET,
      });

      expect(result.valid).toBe(true);
      expect(result.scheme).toBe(WEBHOOK_SIGNATURE_SCHEME);
      expect(result.reason).toBeUndefined();
      expect(result.verificationId).toBe('ver-0001');
      expect(result.verifiedAt).toBe('2026-09-24T12:00:00.000Z');

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          signatureHeader: sign(PAYLOAD, SECRET),
          valid: true,
          reason: null,
        }),
      );
      const record = repo.create.mock.calls[0][0];
      expect(record.payloadHash).toBe(
        crypto.createHash('sha256').update(PAYLOAD).digest('hex'),
      );
      expect(record.secretFingerprint).toMatch(/^[0-9a-f]{16}$/);
      expect(repo.save).toHaveBeenCalled();
    });

    it('persists a failed verification with a reason instead of throwing', async () => {
      const result = await service.verify({
        payload: PAYLOAD,
        signature: sign(PAYLOAD, SECRET),
        secret: 'wrong-secret',
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('signature mismatch');
      expect(
        repo.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ valid: false, reason: 'signature mismatch' }),
      );
    });

    it('reports malformed headers as invalid without throwing', async () => {
      const result = await service.verify({
        payload: PAYLOAD,
        signature: 'garbage',
        secret: SECRET,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('malformed');
    });
  });

  describe('listVerifications', () => {
    it('returns records newest-first with default pagination', async () => {
      repo.find.mockResolvedValue([]);
      await service.listVerifications();
      expect(repo.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 50,
      });
    });

    it('clamps the page size to the documented maximum of 500', async () => {
      repo.find.mockResolvedValue([]);
      await service.listVerifications(9999, 10);
      expect(repo.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        skip: 10,
        take: 500,
      });
    });
  });

  describe('getSpec', () => {
    it('advertises the sha256 scheme and header name', () => {
      expect(service.getSpec()).toEqual({
        scheme: 'sha256',
        headerName: 'X-NexaFX-Signature',
        signedPayloadHint: expect.any(String),
      });
    });
  });
});