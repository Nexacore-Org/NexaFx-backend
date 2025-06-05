import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notifications } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationsService } from './providers/notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: Repository<Notifications>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getRepositoryToken(Notifications),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    repo = module.get<Repository<Notifications>>(
      getRepositoryToken(Notifications),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a notification', async () => {
    const createNotificationDto = new CreateNotificationDto();
    const notification = new Notifications();
    jest.spyOn(repo, 'save').mockResolvedValue(notification);

    expect(await service.create(createNotificationDto)).toBe(notification);
  });
});
