import { Test, TestingModule } from '@nestjs/testing';

// Mock firebase.service before any module imports that transitively load it
jest.mock('../firebase/firebase.service', () => ({
  FirebaseService: class {
    sendToTokens = jest.fn().mockResolvedValue(undefined);
    sendPushNotification = jest.fn().mockResolvedValue(undefined);
  },
}));

import { PushNotificationsController } from './push-notifications.controller';
import { PushNotificationsService } from './push-notifications.service';
import {
  BroadcastResponseDto,
  PaginatedBroadcastResponse,
} from './dto/broadcast-response.dto';
import { PushNotificationStatus } from './entities/push-notification.entity';
import { BroadcastQueryDto } from './dto/broadcast-query.dto';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';

const mockPushNotificationsService = () => ({
  createBroadcast: jest.fn(),
  listBroadcasts: jest.fn(),
  getBroadcastById: jest.fn(),
  deactivateBroadcast: jest.fn(),
  bulkDeactivate: jest.fn(),
});

const makeUser = (): CurrentUserPayload => ({
  userId: 'admin-1',
  email: 'admin@example.com',
  role: 'ADMIN',
});

const makeBroadcastDto = (
  overrides: Partial<BroadcastResponseDto> = {},
): BroadcastResponseDto => ({
  id: 'broadcast-1',
  title: 'Test Broadcast',
  message: 'Hello everyone',
  status: PushNotificationStatus.ACTIVE,
  sentBy: 'admin-1',
  recipientCount: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('PushNotificationsController', () => {
  let controller: PushNotificationsController;
  let pushService: ReturnType<typeof mockPushNotificationsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PushNotificationsController],
      providers: [
        {
          provide: PushNotificationsService,
          useFactory: mockPushNotificationsService,
        },
      ],
    }).compile();

    controller = module.get<PushNotificationsController>(
      PushNotificationsController,
    );
    pushService = module.get(PushNotificationsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createBroadcast()', () => {
    it('delegates to service.createBroadcast() with admin userId', async () => {
      const dto = { title: 'New Feature', message: 'Check it out' };
      const response = makeBroadcastDto();
      pushService.createBroadcast.mockResolvedValue(response);

      const result = await controller.createBroadcast(dto, makeUser());

      expect(pushService.createBroadcast).toHaveBeenCalledWith('admin-1', dto);
      expect(result).toEqual(response);
    });
  });

  describe('listBroadcasts()', () => {
    it('delegates to service.listBroadcasts() with query params', async () => {
      const query: BroadcastQueryDto = {
        page: 1,
        limit: 5,
        status: PushNotificationStatus.ACTIVE,
      };
      const paginated: PaginatedBroadcastResponse = {
        data: [makeBroadcastDto()],
        total: 1,
        page: 1,
        limit: 5,
        totalPages: 1,
      };
      pushService.listBroadcasts.mockResolvedValue(paginated);

      const result = await controller.listBroadcasts(query);

      expect(pushService.listBroadcasts).toHaveBeenCalledWith(query);
      expect(result).toEqual(paginated);
    });
  });

  describe('getBroadcast()', () => {
    it('delegates to service.getBroadcastById()', async () => {
      const response = makeBroadcastDto();
      pushService.getBroadcastById.mockResolvedValue(response);

      const result = await controller.getBroadcast('broadcast-1');

      expect(pushService.getBroadcastById).toHaveBeenCalledWith('broadcast-1');
      expect(result).toEqual(response);
    });

    it('propagates NotFoundException from service', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      pushService.getBroadcastById.mockRejectedValue(
        new NotFoundException('Broadcast with ID not-found not found'),
      );

      await expect(controller.getBroadcast('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deactivateBroadcast()', () => {
    it('delegates to service.deactivateBroadcast() with id and admin userId', async () => {
      const response = makeBroadcastDto({
        status: PushNotificationStatus.INACTIVE,
      });
      pushService.deactivateBroadcast.mockResolvedValue(response);

      const result = await controller.deactivateBroadcast(
        'broadcast-1',
        makeUser(),
      );

      expect(pushService.deactivateBroadcast).toHaveBeenCalledWith(
        'broadcast-1',
        'admin-1',
      );
      expect(result.status).toBe(PushNotificationStatus.INACTIVE);
    });
  });

  describe('bulkDeactivate()', () => {
    it('delegates to service.bulkDeactivate() with ids and admin userId', async () => {
      const ids = ['id-1', 'id-2', 'id-3'];
      pushService.bulkDeactivate.mockResolvedValue({ deactivated: 3 });

      const result = await controller.bulkDeactivate({ ids }, makeUser());

      expect(pushService.bulkDeactivate).toHaveBeenCalledWith(ids, 'admin-1');
      expect(result).toEqual({ deactivated: 3 });
    });
  });
});
