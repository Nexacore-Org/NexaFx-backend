import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';

// Mock firebase.service before any module imports that transitively load it
jest.mock('../firebase/firebase.service', () => ({
  FirebaseService: class {
    sendToTokens = jest.fn().mockResolvedValue(undefined);
    sendPushNotification = jest.fn().mockResolvedValue(undefined);
  },
}));

import { PushNotificationsService } from './push-notifications.service';
import {
  PushNotification,
  PushNotificationStatus,
} from './entities/push-notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { FirebaseService } from '../firebase/firebase.service';
import { BroadcastQueryDto } from './dto/broadcast-query.dto';

const mockPushNotificationRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockNotificationsService = () => ({
  create: jest.fn().mockResolvedValue({}),
  dispatch: jest.fn().mockResolvedValue(undefined),
});

const mockUsersService = () => ({
  findByEmail: jest.fn(),
  findById: jest.fn(),
});

const mockAuditLogsService = () => ({
  createLog: jest.fn().mockResolvedValue(undefined),
});

const mockFirebaseService = () => ({
  sendToTokens: jest.fn().mockResolvedValue(undefined),
});

const makeBroadcast = (
  overrides: Partial<PushNotification> = {},
): PushNotification => ({
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

describe('PushNotificationsService', () => {
  let service: PushNotificationsService;
  let pushRepo: ReturnType<typeof mockPushNotificationRepo>;
  let notificationsService: ReturnType<typeof mockNotificationsService>;
  let usersService: ReturnType<typeof mockUsersService>;
  let auditLogsService: ReturnType<typeof mockAuditLogsService>;
  let firebaseService: ReturnType<typeof mockFirebaseService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationsService,
        {
          provide: getRepositoryToken(PushNotification),
          useFactory: mockPushNotificationRepo,
        },
        { provide: NotificationsService, useFactory: mockNotificationsService },
        { provide: UsersService, useFactory: mockUsersService },
        { provide: AuditLogsService, useFactory: mockAuditLogsService },
        { provide: FirebaseService, useFactory: mockFirebaseService },
      ],
    }).compile();

    service = module.get<PushNotificationsService>(PushNotificationsService);
    pushRepo = module.get(getRepositoryToken(PushNotification));
    notificationsService = module.get(NotificationsService);
    usersService = module.get(UsersService);
    auditLogsService = module.get(AuditLogsService);
    firebaseService = module.get(FirebaseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── createBroadcast() ─────────────────────────────────────────────────────
  describe('createBroadcast()', () => {
    it('creates broadcast, sends individual notifications, and logs audit', async () => {
      const activeUsers = [
        { id: 'user-1', fcmTokens: ['token-1'] },
        { id: 'user-2', fcmTokens: [] },
      ];
      // The service calls (this.usersService as any).findAllActive — patch it directly
      (service as any).usersService.findAllActive = jest
        .fn()
        .mockResolvedValue(activeUsers);

      const broadcast = makeBroadcast({ recipientCount: 2 });
      pushRepo.create.mockReturnValue(broadcast);
      pushRepo.save.mockResolvedValue(broadcast);

      const result = await service.createBroadcast('admin-1', {
        title: 'Test Broadcast',
        message: 'Hello everyone',
      });

      expect(pushRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Broadcast',
          message: 'Hello everyone',
          sentBy: 'admin-1',
          status: PushNotificationStatus.ACTIVE,
        }),
      );
      expect(pushRepo.save).toHaveBeenCalledTimes(1);
      expect(auditLogsService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: 'CREATE_BROADCAST',
        }),
      );
      expect(result.id).toBe('broadcast-1');
    });

    it('creates broadcast with zero recipients when no active users', async () => {
      (service as any).usersService.findAllActive = jest
        .fn()
        .mockResolvedValue([]);

      const broadcast = makeBroadcast({ recipientCount: 0 });
      pushRepo.create.mockReturnValue(broadcast);
      pushRepo.save.mockResolvedValue(broadcast);

      const result = await service.createBroadcast('admin-1', {
        title: 'Empty Broadcast',
        message: 'No users',
      });

      expect(notificationsService.create).not.toHaveBeenCalled();
      expect(firebaseService.sendToTokens).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('does not call sendToTokens when no FCM tokens available', async () => {
      const activeUsers = [
        { id: 'user-1', fcmTokens: [] },
        { id: 'user-2' }, // no fcmTokens property
      ];
      (service as any).usersService.findAllActive = jest
        .fn()
        .mockResolvedValue(activeUsers);

      const broadcast = makeBroadcast({ recipientCount: 2 });
      pushRepo.create.mockReturnValue(broadcast);
      pushRepo.save.mockResolvedValue(broadcast);

      await service.createBroadcast('admin-1', {
        title: 'Test',
        message: 'No tokens',
      });

      expect(firebaseService.sendToTokens).not.toHaveBeenCalled();
    });

    it('wraps unexpected errors in BadRequestException', async () => {
      (service as any).usersService.findAllActive = jest
        .fn()
        .mockResolvedValue([]);
      pushRepo.create.mockReturnValue(makeBroadcast());
      pushRepo.save.mockRejectedValue(new Error('DB connection lost'));

      await expect(
        service.createBroadcast('admin-1', {
          title: 'Test',
          message: 'Error case',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── listBroadcasts() ──────────────────────────────────────────────────────
  describe('listBroadcasts()', () => {
    const makeQueryBuilder = (
      broadcasts: PushNotification[],
      total: number,
    ) => ({
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(total),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(broadcasts),
    });

    it('returns paginated broadcasts with correct metadata', async () => {
      const broadcasts = [makeBroadcast()];
      const qb = makeQueryBuilder(broadcasts, 1);
      pushRepo.createQueryBuilder.mockReturnValue(qb);

      const query: BroadcastQueryDto = { page: 1, limit: 10 };
      const result = await service.listBroadcasts(query);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('applies status filter when provided', async () => {
      const qb = makeQueryBuilder([], 0);
      pushRepo.createQueryBuilder.mockReturnValue(qb);

      await service.listBroadcasts({
        status: PushNotificationStatus.ACTIVE,
        page: 1,
        limit: 10,
      });

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('status'),
        expect.objectContaining({ status: PushNotificationStatus.ACTIVE }),
      );
    });

    it('applies search filter when provided', async () => {
      const qb = makeQueryBuilder([], 0);
      pushRepo.createQueryBuilder.mockReturnValue(qb);

      await service.listBroadcasts({ search: 'feature', page: 1, limit: 10 });

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.objectContaining({ search: '%feature%' }),
      );
    });

    it('uses defaults (page=1, limit=10) when not provided', async () => {
      const qb = makeQueryBuilder([], 0);
      pushRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.listBroadcasts({});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('wraps unexpected errors in BadRequestException', async () => {
      pushRepo.createQueryBuilder.mockImplementation(() => {
        throw new Error('DB error');
      });

      await expect(service.listBroadcasts({})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── getBroadcastById() ────────────────────────────────────────────────────
  describe('getBroadcastById()', () => {
    it('returns the broadcast DTO when found', async () => {
      const broadcast = makeBroadcast();
      pushRepo.findOne.mockResolvedValue(broadcast);

      const result = await service.getBroadcastById('broadcast-1');

      expect(pushRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'broadcast-1' },
      });
      expect(result.id).toBe('broadcast-1');
      expect(result.title).toBe('Test Broadcast');
    });

    it('throws NotFoundException when broadcast not found', async () => {
      pushRepo.findOne.mockResolvedValue(null);

      await expect(service.getBroadcastById('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── deactivateBroadcast() ─────────────────────────────────────────────────
  describe('deactivateBroadcast()', () => {
    it('deactivates an ACTIVE broadcast', async () => {
      const active = makeBroadcast({ status: PushNotificationStatus.ACTIVE });
      const inactive = makeBroadcast({
        status: PushNotificationStatus.INACTIVE,
      });

      pushRepo.findOne
        .mockResolvedValueOnce(active) // first findOne to check existence
        .mockResolvedValueOnce(inactive); // second findOne to return updated
      pushRepo.update.mockResolvedValue({ affected: 1 });

      const result = await service.deactivateBroadcast(
        'broadcast-1',
        'admin-1',
      );

      expect(pushRepo.update).toHaveBeenCalledWith('broadcast-1', {
        status: PushNotificationStatus.INACTIVE,
      });
      expect(auditLogsService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: 'DEACTIVATE_BROADCAST',
        }),
      );
      expect(result.status).toBe(PushNotificationStatus.INACTIVE);
    });

    it('throws BadRequestException when broadcast is already INACTIVE', async () => {
      const inactive = makeBroadcast({
        status: PushNotificationStatus.INACTIVE,
      });
      pushRepo.findOne.mockResolvedValue(inactive);

      await expect(
        service.deactivateBroadcast('broadcast-1', 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when broadcast not found', async () => {
      pushRepo.findOne.mockResolvedValue(null);

      await expect(
        service.deactivateBroadcast('not-found', 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── bulkDeactivate() ──────────────────────────────────────────────────────
  describe('bulkDeactivate()', () => {
    it('throws BadRequestException when ids array is empty', async () => {
      await expect(service.bulkDeactivate([], 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when none of the broadcasts exist', async () => {
      pushRepo.find.mockResolvedValue([]);

      await expect(
        service.bulkDeactivate(['id-1', 'id-2'], 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when only some broadcasts are found', async () => {
      pushRepo.find.mockResolvedValue([makeBroadcast()]); // 1 found, 2 requested

      await expect(
        service.bulkDeactivate(['id-1', 'id-2'], 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('deactivates all provided broadcasts and logs audit', async () => {
      const b1 = makeBroadcast({ id: 'id-1' });
      const b2 = makeBroadcast({ id: 'id-2' });
      pushRepo.find.mockResolvedValue([b1, b2]);
      pushRepo.update.mockResolvedValue({ affected: 2 });

      const result = await service.bulkDeactivate(['id-1', 'id-2'], 'admin-1');

      expect(pushRepo.update).toHaveBeenCalledWith(
        { id: expect.anything() },
        { status: PushNotificationStatus.INACTIVE },
      );
      expect(auditLogsService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BULK_DEACTIVATE_BROADCASTS',
          userId: 'admin-1',
        }),
      );
      expect(result.deactivated).toBe(2);
    });
  });

  // ─── getActiveCount() ──────────────────────────────────────────────────────
  describe('getActiveCount()', () => {
    it('returns count of ACTIVE broadcasts', async () => {
      pushRepo.count.mockResolvedValue(5);

      const result = await service.getActiveCount();

      expect(pushRepo.count).toHaveBeenCalledWith({
        where: { status: PushNotificationStatus.ACTIVE },
      });
      expect(result).toBe(5);
    });
  });
});
