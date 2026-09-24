import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: jest.Mocked<NotificationsService>;

  const mockService = {
    getNotifications: jest.fn(),
    markAllAsRead: jest.fn(),
    markAsRead: jest.fn(),
    getUnreadCount: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    service = module.get(NotificationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call getNotifications with correct params', async () => {
    const req = { user: { userId: 'user-123' } };
    await controller.getNotifications(req, 1, 10, 'true');

    expect(service.getNotifications).toHaveBeenCalledWith(
      'user-123',
      1,
      10,
      true,
    );
  });

  it('should call markAllAsRead with correct params', async () => {
    const req = { user: { userId: 'user-123' } };
    await controller.markAllAsRead(req);

    expect(service.markAllAsRead).toHaveBeenCalledWith('user-123');
  });

  it('should call markAsRead with correct params', async () => {
    const req = { user: { userId: 'user-123' } };
    await controller.markAsRead(req, 'notif-id');

    expect(service.markAsRead).toHaveBeenCalledWith('user-123', 'notif-id');
  });

  it('should call getUnreadCount with correct params', async () => {
    const req = { user: { userId: 'user-123' } };
    await controller.getUnreadCount(req);

    expect(service.getUnreadCount).toHaveBeenCalledWith('user-123');
  });
});
