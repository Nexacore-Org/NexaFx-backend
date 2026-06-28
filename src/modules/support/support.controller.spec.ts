import { Test, TestingModule } from '@nestjs/testing';
import { SupportController, AdminSupportController } from './support.controller';
import { SupportService } from './support.service';
import { CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from './entities/support-ticket.entity';

describe('SupportControllers', () => {
  let userController: SupportController;
  let adminController: AdminSupportController;
  let service: any;

  const mockUserPayload: CurrentUserPayload = {
    userId: 'user-uuid',
    email: 'user@example.com',
    role: 'USER',
  };

  const mockAdminPayload: CurrentUserPayload = {
    userId: 'admin-uuid',
    email: 'admin@example.com',
    role: 'ADMIN',
  };

  const mockService = {
    createTicket: jest.fn(),
    listUserTickets: jest.fn(),
    getUserTicketDetail: jest.fn(),
    replyToTicket: jest.fn(),
    closeTicket: jest.fn(),
    listAdminTickets: jest.fn(),
    getAdminStats: jest.fn(),
    getTicketDetailAdmin: jest.fn(),
    updateTicketAdmin: jest.fn(),
    replyToTicketAdmin: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SupportController, AdminSupportController],
      providers: [
        {
          provide: SupportService,
          useValue: mockService,
        },
      ],
    }).compile();

    userController = module.get<SupportController>(SupportController);
    adminController = module.get<AdminSupportController>(AdminSupportController);
    service = module.get<SupportService>(SupportService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('SupportController (User)', () => {
    it('createTicket calls service.createTicket', async () => {
      const dto = {
        subject: 'KYC Stuck',
        category: SupportTicketCategory.KYC,
        body: 'Please help',
      };
      await userController.createTicket(mockUserPayload, dto);
      expect(service.createTicket).toHaveBeenCalledWith('user-uuid', dto);
    });

    it('listTickets calls service.listUserTickets', async () => {
      await userController.listTickets(mockUserPayload);
      expect(service.listUserTickets).toHaveBeenCalledWith('user-uuid');
    });

    it('getTicketDetail calls service.getUserTicketDetail', async () => {
      await userController.getTicketDetail(mockUserPayload, 'ticket-uuid');
      expect(service.getUserTicketDetail).toHaveBeenCalledWith('ticket-uuid', 'user-uuid');
    });

    it('replyToTicket calls service.replyToTicket', async () => {
      const dto = { body: 'Reply content' };
      await userController.replyToTicket(mockUserPayload, 'ticket-uuid', dto);
      expect(service.replyToTicket).toHaveBeenCalledWith('ticket-uuid', 'user-uuid', dto);
    });

    it('closeTicket calls service.closeTicket', async () => {
      await userController.closeTicket(mockUserPayload, 'ticket-uuid');
      expect(service.closeTicket).toHaveBeenCalledWith('ticket-uuid', 'user-uuid');
    });
  });

  describe('AdminSupportController (Admin)', () => {
    it('listTickets calls service.listAdminTickets', async () => {
      const filter = { status: SupportTicketStatus.OPEN };
      await adminController.listTickets(filter);
      expect(service.listAdminTickets).toHaveBeenCalledWith(filter);
    });

    it('getStats calls service.getAdminStats', async () => {
      await adminController.getStats();
      expect(service.getAdminStats).toHaveBeenCalled();
    });

    it('getTicketDetail calls service.getTicketDetailAdmin', async () => {
      await adminController.getTicketDetail('ticket-uuid');
      expect(service.getTicketDetailAdmin).toHaveBeenCalledWith('ticket-uuid');
    });

    it('updateTicket calls service.updateTicketAdmin', async () => {
      const dto = { priority: SupportTicketPriority.HIGH };
      await adminController.updateTicket('ticket-uuid', dto);
      expect(service.updateTicketAdmin).toHaveBeenCalledWith('ticket-uuid', dto);
    });

    it('replyToTicket calls service.replyToTicketAdmin', async () => {
      const dto = { body: 'Admin reply', isInternal: false };
      await adminController.replyToTicket(mockAdminPayload, 'ticket-uuid', dto);
      expect(service.replyToTicketAdmin).toHaveBeenCalledWith('ticket-uuid', 'admin-uuid', dto);
    });
  });
});
