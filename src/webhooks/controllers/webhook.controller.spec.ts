import { WebhookController } from './webhook.controller';
import { WebhookService } from '../services/webhook.service';
import { WEBHOOK_SCHEMA_VERSIONS } from '../../modules/webhooks/schemas';

describe('WebhookController', () => {
  let controller: WebhookController;
  let service: WebhookService;

  beforeEach(() => {
    service = {
      createEndpoint: jest.fn(),
      updateEndpoint: jest.fn(),
      listEndpoints: jest.fn(),
      deleteEndpoint: jest.fn(),
      getDeliveryHistory: jest.fn(),
      testEndpoint: jest.fn(),
      redeliver: jest.fn(),
    } as unknown as WebhookService;

    controller = new WebhookController(service);
  });

  it('should list endpoints and omit the secret field', async () => {
    (service.listEndpoints as jest.Mock).mockResolvedValue([
      {
        id: '1',
        secret: 'hidden-secret',
        url: 'https://test.com',
        events: ['*'],
      },
    ]);

    const req = { user: { id: 'user1' } };
    const result = await controller.list(req);

    expect(result).toEqual([
      { id: '1', url: 'https://test.com', events: ['*'] },
    ]);
    expect((result[0] as any).secret).toBeUndefined();
  });

  it('should update the preferred schema version and omit the secret', async () => {
    (service.updateEndpoint as jest.Mock).mockResolvedValue({
      id: '1',
      secret: 'hidden-secret',
      url: 'https://test.com',
      events: ['*'],
      preferredSchemaVersion: '1.0',
    });

    const req = { user: { id: 'user1' } };
    const result = await controller.update(req, '1', {
      preferredSchemaVersion: '1.0',
    });

    expect(service.updateEndpoint).toHaveBeenCalledWith('user1', '1', {
      preferredSchemaVersion: '1.0',
    });
    expect(result).toEqual({
      id: '1',
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
    const req = { user: { id: 'user1' } };
    await controller.create(req, {
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

  it('should call testEndpoint on the service', async () => {
    const req = { user: { id: 'user1' } };
    const result = await controller.testEndpoint(req, 'endpoint-123');

    expect(service.testEndpoint).toHaveBeenCalledWith('endpoint-123', 'user1');
    expect(result).toEqual({ success: true });
  });

  it('should call redeliver on the service', async () => {
    const req = { user: { id: 'user1' } };
    const result = await controller.redeliver(
      req,
      'endpoint-123',
      'delivery-456',
    );

    expect(service.redeliver).toHaveBeenCalledWith(
      'endpoint-123',
      'delivery-456',
      'user1',
    );
    expect(result).toEqual({ success: true });
  });
});
