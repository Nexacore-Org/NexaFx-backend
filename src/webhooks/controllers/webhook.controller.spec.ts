import { BadRequestException, ParseUUIDPipe, ValidationPipe } from '@nestjs/common';
import { WebhookController } from './webhook.controller';
import { WebhookService } from '../services/webhook.service';
import { CreateWebhookEndpointDto } from '../dto/create-webhook-endpoint.dto';
import { WEBHOOK_SCHEMA_VERSIONS } from '../../modules/webhooks/schemas';
import { CurrentUserPayload } from '../../auth/decorators/current-user.decorator';

describe('WebhookController', () => {
  let controller: WebhookController;
  let service: WebhookService;

  const user: CurrentUserPayload = {
    userId: 'user1',
    email: 'user1@example.com',
    role: 'USER',
  };

  const validEndpointId = '550e8400-e29b-41d4-a716-446655440000';
  const validDeliveryId = '660e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    service = {
      createEndpoint: jest.fn(),
      updateEndpoint: jest.fn(),
      listEndpoints: jest.fn(),
      deleteEndpoint: jest.fn(),
      rotateSecret: jest.fn(),
      getDeliveryHistory: jest.fn(),
      testEndpoint: jest.fn(),
      redeliver: jest.fn(),
    } as unknown as WebhookService;

    controller = new WebhookController(service);
  });

  it('should list endpoints and omit the secret field', async () => {
    (service.listEndpoints as jest.Mock).mockResolvedValue([
      {
        id: validEndpointId,
        secret: 'hidden-secret',
        url: 'https://test.com',
        events: ['*'],
      },
    ]);

    const result = await controller.list(user);

    expect(service.listEndpoints).toHaveBeenCalledWith('user1');
    expect(result).toEqual([
      { id: validEndpointId, url: 'https://test.com', events: ['*'] },
    ]);
    expect((result[0] as any).secret).toBeUndefined();
  });

  it('should update the preferred schema version and omit the secret', async () => {
    (service.updateEndpoint as jest.Mock).mockResolvedValue({
      id: validEndpointId,
      secret: 'hidden-secret',
      url: 'https://test.com',
      events: ['*'],
      preferredSchemaVersion: '1.0',
    });

    const result = await controller.update(user, validEndpointId, {
      preferredSchemaVersion: '1.0',
    });

    expect(service.updateEndpoint).toHaveBeenCalledWith(
      'user1',
      validEndpointId,
      {
        preferredSchemaVersion: '1.0',
      },
    );
    expect(result).toEqual({
      id: validEndpointId,
      url: 'https://test.com',
      events: ['*'],
      preferredSchemaVersion: '1.0',
    });
    expect((result as any).secret).toBeUndefined();
  });

  it('should expose every schema version with its sunset date', () => {
    const versions = controller.getSchemaVersions();

    expect(versions.map((v) => v.version)).toEqual([
      ...WEBHOOK_SCHEMA_VERSIONS,
    ]);
    expect(versions.find((v) => v.version === '1.0')?.sunsetOn).toBeTruthy();
    expect(versions.find((v) => v.version === '2.0')?.sunsetOn).toBeNull();
  });

  it('should forward the preferred schema version on create', async () => {
    await controller.create(user, {
      url: 'https://test.com',
      events: ['*'],
      preferredSchemaVersion: '1.0',
    });

    expect(service.createEndpoint).toHaveBeenCalledWith(
      'user1',
      'https://test.com',
      ['*'],
      '1.0',
    );
  });

  it('should delete an endpoint for the current user', async () => {
    const result = await controller.remove(user, validEndpointId);

    expect(service.deleteEndpoint).toHaveBeenCalledWith(
      'user1',
      validEndpointId,
    );
    expect(result).toEqual({ success: true });
  });

  it('should fetch delivery history for the current user', async () => {
    (service.getDeliveryHistory as jest.Mock).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    const result = await controller.getDeliveries(user, validEndpointId);

    expect(service.getDeliveryHistory).toHaveBeenCalledWith(
      validEndpointId,
      'user1',
    );
    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
  });

  it('should call testEndpoint on the service', async () => {
    const result = await controller.testEndpoint(user, validEndpointId);

    expect(service.testEndpoint).toHaveBeenCalledWith(validEndpointId, 'user1');
    expect(result).toEqual({ success: true });
  });

  it('should call redeliver on the service', async () => {
    const result = await controller.redeliver(
      user,
      validEndpointId,
      validDeliveryId,
    );

    expect(service.redeliver).toHaveBeenCalledWith(
      validEndpointId,
      validDeliveryId,
      'user1',
    );
    expect(result).toEqual({ success: true });
  });

  describe('DTO and pipe validation (#1509)', () => {
    const validationPipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const parseUuidPipe = new ParseUUIDPipe();

    it("rejects POST /webhooks when events is a non-array ('x') with 400", async () => {
      await expect(
        validationPipe.transform(
          { url: 'https://example.com/hook', events: 'x' },
          { type: 'body', metatype: CreateWebhookEndpointDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects POST /webhooks when url is not HTTPS with 400', async () => {
      await expect(
        validationPipe.transform(
          { url: 'http://example.com/hook', events: ['*'] },
          { type: 'body', metatype: CreateWebhookEndpointDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects non-UUID :id params with 400', async () => {
      await expect(
        parseUuidPipe.transform('not-a-uuid', {
          type: 'param',
          metatype: String,
          data: 'id',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
