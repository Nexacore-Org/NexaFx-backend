import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../../user/entities/user.entity';
import { CanaryToken } from '../../entities/canary-token.entity';
import { EmailService } from '../../../auth/email.service';
import { EventsService } from '../../../realtime/events.service';
import { AlertService } from '../alert.service';
import { Role } from '../../../auth/role.enum';

describe('AlertService', () => {
  let service: AlertService;
  let userRepo: Repository<User>;
  let emailService: EmailService;
  let eventsService: EventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertService,
        {
          provide: getRepositoryToken(User),
          useClass: Repository,
        },
        {
          provide: EmailService,
          useValue: {
            sendMail: jest.fn(),
          },
        },
        {
          provide: EventsService,
          useValue: {
            sendNewNotification: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AlertService>(AlertService);
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    emailService = module.get<EmailService>(EmailService);
    eventsService = module.get<EventsService>(EventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('dispatchSuperAdminExfiltrationEmergency', () => {
    it('should send notifications to all super admins', async () => {
      const canary = new CanaryToken();
      canary.id = '1';
      canary.type = 'test';
      canary.token = 'test-token';
      canary.triggeredAt = new Date();

      const superAdmins = [
        { id: '1', email: 'admin1@test.com', role: Role.SUPER_ADMIN },
        { id: '2', email: 'admin2@test.com', role: Role.SUPER_ADMIN },
      ];

      jest.spyOn(userRepo, 'find').mockResolvedValue(superAdmins as User[]);
      jest.spyOn(emailService, 'sendMail').mockResolvedValue(undefined);
      jest
        .spyOn(eventsService, 'sendNewNotification')
        .mockReturnValue(undefined);

      await service.dispatchSuperAdminExfiltrationEmergency(
        canary,
        'test-source',
      );

      expect(userRepo.find).toHaveBeenCalledWith({
        where: { role: 'SUPER_ADMIN' },
      });
      expect(eventsService.sendNewNotification).toHaveBeenCalledTimes(2);
      expect(emailService.sendMail).toHaveBeenCalledTimes(2);
    });
  });
});
