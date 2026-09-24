import { WebhookVerificationSdkController } from './webhook-verification-sdk.controller';
import { WebhookVerificationSdkService } from './webhook-verification-sdk.service';

describe('WebhookVerificationSdkController', () => {
  let controller: WebhookVerificationSdkController;
  let service: {
    getSpec: jest.Mock;
    verify: jest.Mock;
    listVerifications: jest.Mock;
  };

  beforeEach(() => {
    service = {
      getSpec: jest.fn(),
      verify: jest.fn(),
      listVerifications: jest.fn(),
    } as unknown as WebhookVerificationSdkService;

    controller = new WebhookVerificationSdkController(
      service as unknown as WebhookVerificationSdkService,
    );
  });

  it('exposes the signature scheme metadata', () => {
    service.getSpec.mockReturnValue({ scheme: 'sha256', headerName: 'X-NexaFX-Signature' });
    expect(controller.getSpec()).toEqual({
      scheme: 'sha256',
      headerName: 'X-NexaFX-Signature',
    });
  });

  it('forwards the verification request to the service', async () => {
    const dto = {
      payload: '{"a":1}',
      signature: 'sha256=abcd',
      secret: 's3cr3t',
    };
    service.verify.mockResolvedValue({ valid: true, scheme: 'sha256' });

    const result = await controller.verify(dto);

    expect(service.verify).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ valid: true, scheme: 'sha256' });
  });

  it('forwards verification-history queries with optional pagination', async () => {
    service.listVerifications.mockResolvedValue([]);

    await controller.listVerifications(100, 20);
    expect(service.listVerifications).toHaveBeenCalledWith(100, 20);

    await controller.listVerifications();
    expect(service.listVerifications).toHaveBeenCalledWith(undefined, undefined);
  });
});