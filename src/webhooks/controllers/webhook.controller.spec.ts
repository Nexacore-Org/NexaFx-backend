import { WebhookController } from './webhook.controller';
import { WebhookService } from '../services/webhook.service';

describe('WebhookController', () => {
  let controller: WebhookController;
  let service: WebhookService;

  beforeEach(() => {
    service = {
      createEndpoint: jest.fn(),
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
