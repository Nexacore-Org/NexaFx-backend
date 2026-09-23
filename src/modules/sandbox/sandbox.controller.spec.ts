import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SandboxController } from './sandbox.controller';
import { SandboxService } from './sandbox.service';

// Prevent loading the real SandboxService's transitively-heavy dependency chain.
jest.mock('../../wallets/wallets.service', () => ({
  WalletsService: class {},
}));
jest.mock('../../users/users.service', () => ({ UsersService: class {} }));

describe('SandboxController', () => {
  let controller: SandboxController;
  let sandboxService: any;

  beforeEach(async () => {
    sandboxService = {
      register: jest.fn(),
      reset: jest.fn(),
      findByUserId: jest.fn(),
      getEvents: jest.fn(),
      triggerEvent: jest.fn(),
      getRequestLog: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SandboxController],
      providers: [{ provide: SandboxService, useValue: sandboxService }],
    }).compile();

    controller = module.get<SandboxController>(SandboxController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('delegates to the service with the authenticated user id', async () => {
      sandboxService.register.mockResolvedValue({ apiKey: 'nxa_test_x' });
      const result = await controller.register({ user: { id: 'user-1' } });
      expect(sandboxService.register).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ apiKey: 'nxa_test_x' });
    });
  });

  describe('reset', () => {
    it('delegates to the service with the authenticated user id', async () => {
      sandboxService.reset.mockResolvedValue({ id: 'sandbox-1' });
      const result = await controller.reset({ user: { id: 'user-1' } });
      expect(sandboxService.reset).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ id: 'sandbox-1' });
    });
  });

  describe('getEvents', () => {
    it('returns events for the user sandbox account', async () => {
      sandboxService.findByUserId.mockResolvedValue({ id: 'sandbox-1' });
      sandboxService.getEvents.mockResolvedValue([{ id: 'evt-1' }]);

      const result = await controller.getEvents({ user: { id: 'user-1' } });

      expect(sandboxService.findByUserId).toHaveBeenCalledWith('user-1');
      expect(sandboxService.getEvents).toHaveBeenCalledWith('sandbox-1');
      expect(result).toEqual([{ id: 'evt-1' }]);
    });

    it('throws NotFoundException when the user has no sandbox account', async () => {
      sandboxService.findByUserId.mockResolvedValue(null);

      await expect(
        controller.getEvents({ user: { id: 'user-1' } }),
      ).rejects.toThrow(NotFoundException);
      expect(sandboxService.getEvents).not.toHaveBeenCalled();
    });
  });

  describe('triggerEvent', () => {
    it('triggers an event on the user sandbox account', async () => {
      sandboxService.findByUserId.mockResolvedValue({ id: 'sandbox-1' });
      sandboxService.triggerEvent.mockResolvedValue({ id: 'evt-1' });

      const result = await controller.triggerEvent(
        { user: { id: 'user-1' } },
        { eventType: 'CUSTOM', data: { amount: 1 } },
      );

      expect(sandboxService.triggerEvent).toHaveBeenCalledWith(
        'sandbox-1',
        'CUSTOM',
        { amount: 1 },
      );
      expect(result).toEqual({ id: 'evt-1' });
    });

    it('throws NotFoundException when the user has no sandbox account', async () => {
      sandboxService.findByUserId.mockResolvedValue(null);

      await expect(
        controller.triggerEvent(
          { user: { id: 'user-1' } },
          {
            eventType: 'X',
            data: {},
          },
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRequestLog', () => {
    it('returns the request log for the user sandbox account', async () => {
      sandboxService.findByUserId.mockResolvedValue({ id: 'sandbox-1' });
      sandboxService.getRequestLog.mockResolvedValue([{ id: 'log-1' }]);

      const result = await controller.getRequestLog({ user: { id: 'user-1' } });

      expect(sandboxService.getRequestLog).toHaveBeenCalledWith('sandbox-1');
      expect(result).toEqual([{ id: 'log-1' }]);
    });

    it('throws NotFoundException when the user has no sandbox account', async () => {
      sandboxService.findByUserId.mockResolvedValue(null);

      await expect(
        controller.getRequestLog({ user: { id: 'user-1' } }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
