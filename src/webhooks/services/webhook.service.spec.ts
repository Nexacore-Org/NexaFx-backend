import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WebhookEndpoint } from '../entities/webhook-endpoint.entity';
import { WebhookDelivery } from '../entities/webhook-delivery.entity';
import { BadRequestException } from '@nestjs/common';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WebhookService', () => {
  let service: WebhookService;
  let endpointRepo: any;
  let deliveryRepo: any;

  beforeEach(async () => {
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
  });

  describe('dispatch', () => {
    it('should shape payload correctly and execute delivery without awaiting', async () => {
      endpointRepo.find.mockResolvedValue([
        {
          id: '1',
          url: 'https://test.com',
          events: ['*'],
          secret: 'test-secret',
          isActive: true,
        },
      ]);
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'OK' });

      await service.dispatch('transaction.completed', { foo: 'bar' }, 'user1');

      expect(deliveryRepo.create).toHaveBeenCalled();
      const createdDelivery = deliveryRepo.create.mock.calls[0][0];

      expect(createdDelivery.eventType).toBe('transaction.completed');
      expect(createdDelivery.payload.id).toBeDefined();
      expect(createdDelivery.payload.event).toBe('transaction.completed');
      expect(createdDelivery.payload.data).toEqual({ foo: 'bar' });
      expect(createdDelivery.payload.timestamp).toBeDefined();
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
