import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';

describe('NotificationsController', () => {
  let controller: NotificationsController;

  const mockService = {
    findAll: jest.fn(),
    getUnreadCount: jest.fn(),
    markAllAsRead: jest.fn(),
    deleteAllByUser: jest.fn(),
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

    controller = module.get(NotificationsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should extract userId from CurrentUser decorator', async () => {
    const user: CurrentUserPayload = {
      userId: 'user-123',
      email: 'test@example.com',
      role: 'USER',
    };

    await controller.findAll(user, 1, 10);

    expect(mockService.findAll).toHaveBeenCalledWith(
      'user-123',
      1,
      10,
      undefined,
      undefined,
    );
  });
});
