import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WebhookEndpoint } from '../entities/webhook-endpoint.entity';
import { WebhookDelivery } from '../entities/webhook-delivery.entity';
import { BadRequestException } from '@nestjs/common';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WebhookService', () => {
  let service: WebhookService;
  let endpointRepo: any;
  let deliveryRepo: any;
  let auditLogsService: any;

  beforeEach(async () => {
    auditLogsService = { log: jest.fn().mockResolvedValue(undefined) };

    endpointRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest
        .fn()
        .mockImplementation((entity) =>
          Promise.resolve({ id: 'endpoint-id', ...entity }),
        ),
      find: jest.fn(),
      findOne: jest.fn(),
      delete: jest.fn(),
    };

    deliveryRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest
        .fn()
        .mockImplementation((entity) =>
          Promise.resolve({ id: 'delivery-id', ...entity }),
        ),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        {
          provide: getRepositoryToken(WebhookEndpoint),
          useValue: endpointRepo,
        },
        {
          provide: getRepositoryToken(WebhookDelivery),
          useValue: deliveryRepo,
        },
        {
          provide: 'BullQueue_webhook-queue',
          useValue: {
            add: jest.fn(),
          },
        },
        {
          provide: AuditLogsService,
          useValue: auditLogsService,
        },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createEndpoint', () => {
    it('should reject HTTP urls', async () => {
      await expect(
        service.createEndpoint('user1', 'http://test.com', ['*']),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create endpoint for valid HTTPS url', async () => {
      const endpoint = await service.createEndpoint(
        'user1',
        'https://test.com',
        ['*'],
      );
      expect(endpoint.url).toBe('https://test.com');
      expect(endpoint.secret).toBeDefined();
    });

    it('should leave preferredSchemaVersion to the column default', async () => {
      await service.createEndpoint('user1', 'https://test.com', ['*']);

      expect(
        endpointRepo.create.mock.calls[0][0],
      ).not.toHaveProperty('preferredSchemaVersion');
    });

    it('should accept an explicit supported schema version', async () => {
      const endpoint = await service.createEndpoint(
        'user1',
        'https://test.com',
        ['*'],
        '1.0',
      );
      expect(endpoint.preferredSchemaVersion).toBe('1.0');
    });

    it('should reject an unsupported schema version', async () => {
      await expect(
        service.createEndpoint('user1', 'https://test.com', ['*'], '3.0'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateEndpoint', () => {
    it('should throw BadRequestException if endpoint not found', async () => {
      endpointRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateEndpoint('user1', 'endpoint1', {
          preferredSchemaVersion: '1.0',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should pin the endpoint to the requested schema version', async () => {
      endpointRepo.findOne.mockResolvedValue({
        id: '1',
        userId: 'user1',
        url: 'https://test.com',
        events: ['*'],
        preferredSchemaVersion: '2.0',
      });

      const updated = await service.updateEndpoint('user1', '1', {
        preferredSchemaVersion: '1.0',
      });

      expect(updated.preferredSchemaVersion).toBe('1.0');
      expect(endpointRepo.save).toHaveBeenCalled();
    });

    it('should reject an unsupported schema version', async () => {
      endpointRepo.findOne.mockResolvedValue({
        id: '1',
        userId: 'user1',
        url: 'https://test.com',
        events: ['*'],
        preferredSchemaVersion: '2.0',
      });

      await expect(
        service.updateEndpoint('user1', '1', {
          preferredSchemaVersion: '9.9' as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should re-validate a replacement url', async () => {
      endpointRepo.findOne.mockResolvedValue({
        id: '1',
        userId: 'user1',
        url: 'https://test.com',
        events: ['*'],
        preferredSchemaVersion: '2.0',
      });

      await expect(
        service.updateEndpoint('user1', '1', { url: 'http://insecure.com' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('dispatch', () => {
    const rawTransaction = {
      id: 'tx-1',
      userId: 'user1',
      type: 'SWAP',
      status: 'SUCCESS',
      amount: '150.00000000',
      currency: 'USD',
      feeAmount: '1.50000000',
      feeCurrency: 'USD',
      txHash: 'hash-abc',
      userNote: 'private note',
    };

    it('should deliver the v1 payload shape to a 1.0 endpoint', async () => {
      endpointRepo.find.mockResolvedValue([
        {
          id: '1',
          url: 'https://test.com',
          events: ['*'],
          secret: 'test-secret',
          isActive: true,
          preferredSchemaVersion: '1.0',
        },
      ]);

      await service.dispatch('transaction.completed', rawTransaction, 'user1');

      const { payload } = deliveryRepo.create.mock.calls[0][0];

      expect(payload.schemaVersion).toBe('1.0');
      expect(payload.event).toBe('transaction.completed');
      expect(payload.id).toBeDefined();
      expect(payload.timestamp).toBeDefined();
      expect(payload.data).toEqual(rawTransaction);
    });

    it('should deliver the v2 payload shape to a 2.0 endpoint', async () => {
      endpointRepo.find.mockResolvedValue([
        {
          id: '1',
          url: 'https://test.com',
          events: ['*'],
          secret: 'test-secret',
          isActive: true,
          preferredSchemaVersion: '2.0',
        },
      ]);

      await service.dispatch('transaction.completed', rawTransaction, 'user1');

      const { payload } = deliveryRepo.create.mock.calls[0][0];

      expect(payload.schemaVersion).toBe('2.0');
      expect(payload.data.transactionId).toBe('tx-1');
      expect(payload.data.amount).toBe(150);
      expect(payload.data.status).toBe('success');
      expect(payload.data.fee).toEqual({ amount: 1.5, currency: 'USD' });
      expect(payload.data.stellarTxHash).toBe('hash-abc');
      expect(payload.data).not.toHaveProperty('userNote');
    });

    it('should give each endpoint its own shape but one shared event id', async () => {
      endpointRepo.find.mockResolvedValue([
        {
          id: '1',
          url: 'https://one.com',
          events: ['*'],
          secret: 's1',
          isActive: true,
          preferredSchemaVersion: '1.0',
        },
        {
          id: '2',
          url: 'https://two.com',
          events: ['*'],
          secret: 's2',
          isActive: true,
          preferredSchemaVersion: '2.0',
        },
      ]);

      await service.dispatch('transaction.completed', rawTransaction, 'user1');

      const first = deliveryRepo.create.mock.calls[0][0].payload;
      const second = deliveryRepo.create.mock.calls[1][0].payload;

      expect(first.schemaVersion).toBe('1.0');
      expect(second.schemaVersion).toBe('2.0');
      expect(first.id).toBe(second.id);
      expect(first.timestamp).toBe(second.timestamp);
    });
  });

  describe('executeDelivery schema headers', () => {
    const delivery = (schemaVersion: string) => ({
      id: 'delivery-1',
      endpointId: '1',
      eventType: 'transaction.completed',
      payload: { schemaVersion, event: 'transaction.completed', data: {} },
      attemptCount: 0,
    });

    const endpoint = (preferredSchemaVersion: string) => ({
      id: '1',
      userId: 'user1',
      url: 'https://test.com',
      secret: 'test-secret',
      isActive: true,
      preferredSchemaVersion,
    });

    beforeEach(() => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'OK' });
    });

    it('should send deprecation headers to a 1.0 endpoint', async () => {
      await service.executeDelivery(
        delivery('1.0') as any,
        endpoint('1.0') as any,
      );

      const { headers } = mockedAxios.post.mock.calls[0][2] as any;

      expect(headers['X-NexaFX-Schema-Version']).toBe('1.0');
      expect(headers['X-NexaFX-Schema-Deprecated']).toBe('true');
      expect(headers['Deprecation']).toBe('true');
      expect(headers['Sunset']).toMatch(/GMT$/);
    });

    it('should not send deprecation headers to a 2.0 endpoint', async () => {
      await service.executeDelivery(
        delivery('2.0') as any,
        endpoint('2.0') as any,
      );

      const { headers } = mockedAxios.post.mock.calls[0][2] as any;

      expect(headers['X-NexaFX-Schema-Version']).toBe('2.0');
      expect(headers['X-NexaFX-Schema-Deprecated']).toBeUndefined();
      expect(headers['Deprecation']).toBeUndefined();
      expect(headers['Sunset']).toBeUndefined();
    });

    it('should log webhook.deprecated_schema_used for 1.0 deliveries', async () => {
      await service.executeDelivery(
        delivery('1.0') as any,
        endpoint('1.0') as any,
      );

      expect(auditLogsService.log).toHaveBeenCalledWith(
        'user1',
        'webhook.deprecated_schema_used',
        'WEBHOOK_ENDPOINT',
        '1',
        'SUCCESS',
        expect.objectContaining({
          schemaVersion: '1.0',
          eventType: 'transaction.completed',
          deliveryId: 'delivery-1',
        }),
      );
    });

    it('should not log a deprecation audit event for 2.0 deliveries', async () => {
      await service.executeDelivery(
        delivery('2.0') as any,
        endpoint('2.0') as any,
      );

      expect(auditLogsService.log).not.toHaveBeenCalled();
    });

    it('should fall back to the endpoint preference for pre-versioning deliveries', async () => {
      const legacyDelivery = {
        id: 'delivery-legacy',
        endpointId: '1',
        eventType: 'transaction.completed',
        payload: { event: 'transaction.completed', data: {} },
        attemptCount: 0,
      };

      await service.executeDelivery(
        legacyDelivery as any,
        endpoint('1.0') as any,
      );

      const { headers } = mockedAxios.post.mock.calls[0][2] as any;
      expect(headers['X-NexaFX-Schema-Version']).toBe('1.0');
      expect(headers['X-NexaFX-Schema-Deprecated']).toBe('true');
    });

    it('should still deliver when the audit write fails', async () => {
      auditLogsService.log.mockRejectedValueOnce(new Error('audit down'));

      await service.executeDelivery(
        delivery('1.0') as any,
        endpoint('1.0') as any,
      );

      expect(mockedAxios.post).toHaveBeenCalled();
      expect(deliveryRepo.save).toHaveBeenCalled();
    });
  });

  describe('testEndpoint', () => {
    it('should throw BadRequestException if endpoint not found', async () => {
      endpointRepo.findOne.mockResolvedValue(null);
      await expect(service.testEndpoint('endpoint1', 'user1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should execute ping delivery', async () => {
      endpointRepo.findOne.mockResolvedValue({
        id: '1',
        url: 'https://test.com',
        secret: 'test-secret',
        isActive: true,
      });
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'OK' });

      await service.testEndpoint('1', 'user1');

      expect(deliveryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'ping',
        }),
      );
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://test.com',
        expect.any(Object),
        expect.any(Object),
      );
    });
  });

  describe('redeliver', () => {
    it('should throw BadRequestException if endpoint not found', async () => {
      endpointRepo.findOne.mockResolvedValue(null);
      await expect(
        service.redeliver('endpoint1', 'delivery1', 'user1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if delivery not found', async () => {
      endpointRepo.findOne.mockResolvedValue({
        id: '1',
        url: 'https://test.com',
        secret: 'test-secret',
        isActive: true,
      });
      deliveryRepo.findOne.mockResolvedValue(null);
      await expect(
        service.redeliver('1', 'delivery1', 'user1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should re-execute delivery', async () => {
      endpointRepo.findOne.mockResolvedValue({
        id: '1',
        url: 'https://test.com',
        secret: 'test-secret',
        isActive: true,
      });
      deliveryRepo.findOne.mockResolvedValue({
        id: 'delivery1',
        endpointId: '1',
        payload: {},
        attemptCount: 1,
      });
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'OK' });

      await service.redeliver('1', 'delivery1', 'user1');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://test.com',
        expect.any(Object),
        expect.any(Object),
      );
    });
  });
});
