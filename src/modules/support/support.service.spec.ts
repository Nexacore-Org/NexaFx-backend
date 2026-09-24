import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource, In, LessThan } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';

import { SupportService } from './support.service';
import {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from './entities/support-ticket.entity';
import {
  TicketMessage,
  TicketMessageAuthorRole,
} from './entities/ticket-message.entity';
import { User, UserRole } from '../../users/user.entity';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditEntityType } from '../../audit-logs/enums/audit-entity-type.enum';
import { NotificationType } from '../../notifications/entities/notification.entity';

describe('SupportService', () => {
  let service: SupportService;
  let ticketRepo: any;
  let messageRepo: any;
  let userRepo: any;
  let auditLogsService: any;
  let notificationsService: any;
  let configService: any;
  let dataSource: any;

  const mockTicket = {
    id: 'ticket-uuid',
    ticketNumber: 'TKT-00001',
    userId: 'user-uuid',
    subject: 'KYC Verification Stuck',
    category: SupportTicketCategory.KYC,
    priority: SupportTicketPriority.LOW,
    status: SupportTicketStatus.OPEN,
    slaDeadlineAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    isSlaBreached: false,
    resolvedAt: null,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockUser = {
    id: 'user-uuid',
    email: 'user@example.com',
    firstName: 'John',
    role: UserRole.USER,
  };

  const mockAdmin = {
    id: 'admin-uuid',
    email: 'admin@example.com',
    firstName: 'Admin',
    role: UserRole.ADMIN,
  };

  // Mock QueryBuilder for ticket filtering and relations
  const createMockQueryBuilder = (result: any) => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockImplementation(() => qb),
      where: jest.fn().mockImplementation(() => qb),
      andWhere: jest.fn().mockImplementation(() => qb),
      orderBy: jest.fn().mockImplementation(() => qb),
      groupBy: jest.fn().mockImplementation(() => qb),
      select: jest.fn().mockImplementation(() => qb),
      addSelect: jest.fn().mockImplementation(() => qb),
      getOne: jest.fn().mockResolvedValue(result),
      getMany: jest.fn().mockResolvedValue(Array.isArray(result) ? result : [result]),
      getRawOne: jest.fn().mockResolvedValue({ avgHours: '12.5' }),
      getRawMany: jest.fn().mockResolvedValue([
        { priority: 'LOW', count: '5' },
        { priority: 'HIGH', count: '2' },
      ]),
    };
    return qb;
  };

  beforeEach(async () => {
    const mockManager = {
      create: jest.fn((entity, data) => data),
      save: jest.fn().mockImplementation((entity) => {
        if (entity instanceof SupportTicket || (entity && !entity.body)) {
          return Promise.resolve({ ...mockTicket, ...entity });
        }
        return Promise.resolve({
          id: 'msg-uuid',
          createdAt: new Date(),
          ...entity,
        });
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportService,
        {
          provide: getRepositoryToken(SupportTicket),
          useValue: {
            create: jest.fn((data) => ({ ...mockTicket, ...data })),
            save: jest.fn((ticket) => Promise.resolve({ ...mockTicket, ...ticket })),
            findOne: jest.fn().mockResolvedValue(mockTicket),
            find: jest.fn().mockResolvedValue([mockTicket]),
            count: jest.fn().mockResolvedValue(2),
            createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder(mockTicket)),
          },
        },
        {
          provide: getRepositoryToken(TicketMessage),
          useValue: {
            create: jest.fn((data) => ({ id: 'msg-uuid', ...data })),
            save: jest.fn((msg) => Promise.resolve({ id: 'msg-uuid', ...msg })),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockUser),
            find: jest.fn().mockResolvedValue([mockAdmin]),
          },
        },
        {
          provide: AuditLogsService,
          useValue: {
            createLog: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn().mockResolvedValue({ id: 'notification-uuid' }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'SLA_HOURS_LOW') return 72;
              if (key === 'SLA_HOURS_MEDIUM') return 24;
              if (key === 'SLA_HOURS_HIGH') return 8;
              if (key === 'SLA_HOURS_URGENT') return 2;
              return undefined;
            }),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
          },
        },
      ],
    }).compile();

    service = module.get<SupportService>(SupportService);
    ticketRepo = module.get(getRepositoryToken(SupportTicket));
    messageRepo = module.get(getRepositoryToken(TicketMessage));
    userRepo = module.get(getRepositoryToken(User));
    auditLogsService = module.get(AuditLogsService);
    notificationsService = module.get(NotificationsService);
    configService = module.get(ConfigService);
    dataSource = module.get(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTicket', () => {
    it('should create a support ticket and message in a transaction, log audit, and send email', async () => {
      const dto = {
        subject: 'KYC verification issue',
        category: SupportTicketCategory.KYC,
        body: 'Please help, KYC stuck for days',
        priority: SupportTicketPriority.LOW,
      };

      const result = await service.createTicket('user-uuid', dto);

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(auditLogsService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-uuid',
          action: 'TICKET_CREATE',
          entity: AuditEntityType.USER,
        }),
      );
      expect(result.subject).toBe(dto.subject);
    });

    it('should correctly set SLA deadline on ticket creation based on priority', async () => {
      const dto = {
        subject: 'Urgent transaction issue',
        category: SupportTicketCategory.TRANSACTION,
        body: 'Double charge',
        priority: SupportTicketPriority.URGENT,
      };

      const result = await service.createTicket('user-uuid', dto);

      // Expected URGENT SLA is 2 hours. Assert it is roughly 2 hours from now
      const timeDiff = result.slaDeadlineAt.getTime() - Date.now();
      const hoursDiff = timeDiff / (1000 * 60 * 60);
      expect(hoursDiff).toBeCloseTo(2, 0);
    });
  });

  describe('getUserTicketDetail', () => {
    it('should return ticket details with messages excluding internal messages', async () => {
      const qb = createMockQueryBuilder(mockTicket);
      jest.spyOn(ticketRepo, 'createQueryBuilder').mockReturnValue(qb);

      const result = await service.getUserTicketDetail('ticket-uuid', 'user-uuid');

      expect(ticketRepo.createQueryBuilder).toHaveBeenCalledWith('ticket');
      expect(qb.leftJoinAndSelect).toHaveBeenCalledWith(
        'ticket.messages',
        'message',
        'message.isInternal = :isInternal',
        { isInternal: false },
      );
      expect(result).toBeDefined();
      expect(result.id).toBe('ticket-uuid');
    });

    it('should throw NotFoundException if ticket does not exist or belongs to another user', async () => {
      jest.spyOn(ticketRepo, 'createQueryBuilder').mockReturnValue(
        createMockQueryBuilder(null),
      );

      await expect(
        service.getUserTicketDetail('other-ticket', 'user-uuid'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('replyToTicket', () => {
    it('should successfully add a user message reply to a ticket', async () => {
      const dto = { body: 'Heres the requested document' };
      jest.spyOn(ticketRepo, 'findOne').mockResolvedValue(mockTicket);

      const result = await service.replyToTicket('ticket-uuid', 'user-uuid', dto);

      expect(messageRepo.save).toHaveBeenCalled();
      expect(result.body).toBe(dto.body);
    });

    it('should throw BadRequestException when replying to a closed ticket', async () => {
      jest.spyOn(ticketRepo, 'findOne').mockResolvedValue({
        ...mockTicket,
        status: SupportTicketStatus.CLOSED,
      });

      await expect(
        service.replyToTicket('ticket-uuid', 'user-uuid', { body: 'Reply' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reopen ticket and reset resolvedAt if user replies to a RESOLVED ticket', async () => {
      const ticketToReopen = {
        ...mockTicket,
        status: SupportTicketStatus.RESOLVED,
        resolvedAt: new Date(),
      };
      jest.spyOn(ticketRepo, 'findOne').mockResolvedValue(ticketToReopen);
      const saveSpy = jest.spyOn(ticketRepo, 'save').mockResolvedValue(ticketToReopen as any);

      await service.replyToTicket('ticket-uuid', 'user-uuid', { body: 'Reopen please' });

      expect(ticketToReopen.status).toBe(SupportTicketStatus.IN_PROGRESS);
      expect(ticketToReopen.resolvedAt).toBeNull();
      expect(saveSpy).toHaveBeenCalledWith(ticketToReopen);
    });
  });

  describe('closeTicket', () => {
    it('should update status to CLOSED, set closedAt, and log the action', async () => {
      jest.spyOn(ticketRepo, 'findOne').mockResolvedValue(mockTicket);
      const saveSpy = jest.spyOn(ticketRepo, 'save').mockResolvedValue({
        ...mockTicket,
        status: SupportTicketStatus.CLOSED,
        closedAt: new Date(),
      } as any);

      const result = await service.closeTicket('ticket-uuid', 'user-uuid');

      expect(saveSpy).toHaveBeenCalled();
      expect(result.status).toBe(SupportTicketStatus.CLOSED);
      expect(result.closedAt).toBeDefined();
      expect(auditLogsService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TICKET_CLOSE',
        }),
      );
    });
  });

  describe('updateTicketAdmin', () => {
    it('should set resolvedAt when status is updated to RESOLVED by admin', async () => {
      jest.spyOn(ticketRepo, 'findOne').mockResolvedValue(mockTicket);
      const saveSpy = jest.spyOn(ticketRepo, 'save').mockImplementation((ticket: any) => Promise.resolve(ticket));

      const result = await service.updateTicketAdmin('ticket-uuid', {
        status: SupportTicketStatus.RESOLVED,
      });

      expect(saveSpy).toHaveBeenCalled();
      expect(result.status).toBe(SupportTicketStatus.RESOLVED);
      expect(result.resolvedAt).toBeDefined();
      expect(result.closedAt).toBeNull();
    });

    it('should set closedAt when status is updated to CLOSED by admin', async () => {
      jest.spyOn(ticketRepo, 'findOne').mockResolvedValue(mockTicket);
      const saveSpy = jest.spyOn(ticketRepo, 'save').mockImplementation((ticket: any) => Promise.resolve(ticket));

      const result = await service.updateTicketAdmin('ticket-uuid', {
        status: SupportTicketStatus.CLOSED,
      });

      expect(saveSpy).toHaveBeenCalled();
      expect(result.status).toBe(SupportTicketStatus.CLOSED);
      expect(result.closedAt).toBeDefined();
    });
  });

  describe('replyToTicketAdmin', () => {
    it('should save admin reply and send email & transition status to PENDING_USER if reply is not internal', async () => {
      jest.spyOn(ticketRepo, 'findOne').mockResolvedValue(mockTicket);
      const saveTicketSpy = jest.spyOn(ticketRepo, 'save').mockImplementation((ticket: any) => Promise.resolve(ticket));

      const result = await service.replyToTicketAdmin('ticket-uuid', 'admin-uuid', {
        body: 'Admin reply',
        isInternal: false,
      });

      expect(messageRepo.save).toHaveBeenCalled();
      expect(saveTicketSpy).toHaveBeenCalled();
      expect(mockTicket.status).toBe(SupportTicketStatus.PENDING_USER);
      expect(result.isInternal).toBe(false);
    });

    it('should save admin reply but NOT send email or transition status if reply is internal', async () => {
      jest.spyOn(ticketRepo, 'findOne').mockResolvedValue({
        ...mockTicket,
        status: SupportTicketStatus.OPEN,
      });
      const saveTicketSpy = jest.spyOn(ticketRepo, 'save').mockImplementation((ticket: any) => Promise.resolve(ticket));

      const result = await service.replyToTicketAdmin('ticket-uuid', 'admin-uuid', {
        body: 'Admin internal note',
        isInternal: true,
      });

      expect(messageRepo.save).toHaveBeenCalled();
      expect(saveTicketSpy).not.toHaveBeenCalled();
      expect(result.isInternal).toBe(true);
    });
  });

  describe('getAdminStats', () => {
    it('should aggregate statistics for support dashboard', async () => {
      const result = await service.getAdminStats();

      expect(result.openTicketsByPriority).toBeDefined();
      expect(result.openTicketsByPriority.LOW).toBe(5);
      expect(result.openTicketsByPriority.HIGH).toBe(2);
      expect(result.slaBreachCount).toBe(2);
      expect(result.avgResolutionTime).toBe(12.5);
    });
  });

  describe('handleSlaBreaches', () => {
    it('should escalate overdue tickets to URGENT, flag as SLA breached, create logs, and notify admins', async () => {
      const overdueTicket = {
        ...mockTicket,
        id: 'breached-ticket-id',
        status: SupportTicketStatus.OPEN,
        slaDeadlineAt: new Date(Date.now() - 5000), // 5s in past
        isSlaBreached: false,
        priority: SupportTicketPriority.LOW,
      };

      jest.spyOn(ticketRepo, 'find').mockResolvedValue([overdueTicket]);
      const saveSpy = jest.spyOn(ticketRepo, 'save').mockResolvedValue(overdueTicket as any);

      await service.handleSlaBreaches();

      expect(saveSpy).toHaveBeenCalled();
      expect(overdueTicket.priority).toBe(SupportTicketPriority.URGENT);
      expect(overdueTicket.isSlaBreached).toBe(true);
      expect(auditLogsService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TICKET_SLA_BREACH',
          entity: AuditEntityType.SYSTEM,
        }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.SYSTEM,
          title: expect.stringContaining('SLA Breach'),
        }),
      );
    });
  });
});
