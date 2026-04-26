import { Test, TestingModule } from '@nestjs/testing';
import { GatewaysController } from './gateways.controller';

describe('GatewaysController', () => {
  let controller: GatewaysController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GatewaysController],
    }).compile();

    controller = module.get<GatewaysController>(GatewaysController);
  });

  describe('getInfo', () => {
    it('should return the correct namespace', () => {
      const result = controller.getInfo();
      expect(result.namespace).toBe('/rates');
    });

    it('should return authentication with correct method and type', () => {
      const result = controller.getInfo();
      expect(result.authentication).toEqual({
        method: 'handshake.auth.token',
        type: 'JWT Bearer',
      });
    });

    it('should return clientEvents containing subscribe and unsubscribe', () => {
      const result = controller.getInfo();
      expect(result.clientEvents).toContain('subscribe');
      expect(result.clientEvents).toContain('unsubscribe');
    });

    it('should return serverEvents containing rate_update, error, and 401', () => {
      const result = controller.getInfo();
      expect(result.serverEvents).toContain('rate_update');
      expect(result.serverEvents).toContain('error');
      expect(result.serverEvents).toContain('401');
    });

    it('should return a response with all required top-level fields', () => {
      const result = controller.getInfo();
      expect(result).toHaveProperty('namespace');
      expect(result).toHaveProperty('authentication');
      expect(result).toHaveProperty('clientEvents');
      expect(result).toHaveProperty('serverEvents');
    });

    it('should return the exact expected shape', () => {
      const result = controller.getInfo();
      expect(result).toEqual({
        namespace: '/rates',
        authentication: {
          method: 'handshake.auth.token',
          type: 'JWT Bearer',
        },
        clientEvents: ['subscribe', 'unsubscribe'],
        serverEvents: ['rate_update', 'error', '401'],
      });
    });
  });
});
