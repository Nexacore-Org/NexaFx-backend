// src/support-tickets/support-tickets.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { SupportTicketsController } from './support-tickets.controller';
import { SupportTicketsService } from './support-tickets.service';
import { SupportTicket, TicketStatus } from './entities/support-ticket.entity';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '../users/enums/role.enum';

const mockTicket = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  userId: 'user-123',
  subject: 'Test Ticket',
  description: 'This is a test ticket',
  status: TicketStatus.OPEN,
  response: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('SupportTicketsController', () => {
  let controller: SupportTicketsController;
  let service: SupportTicketsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SupportTicketsController],
      providers: [
        {
          provide: SupportTicketsService,
          useValue: {
            create: jest.fn().mockResolvedValue(mockTicket),
            findAll: jest.fn().mockResolvedValue([mockTicket]),
            findUserTickets: jest.fn().mockResolvedValue([mockTicket]),
            findOne: jest.fn().mockResolvedValue(mockTicket),
            update: jest.fn().mockResolvedValue({
              ...mockTicket,
              response: 'This is a response',
              status: TicketStatus.RESPONDED,
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<SupportTicketsController>(SupportTicketsController);
    service = module.get<SupportTicketsService>(SupportTicketsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new ticket', async () => {
      const createTicketDto = {
        subject: 'Test Ticket',
        description: 'This is a test ticket',
      };
      const req = { user: { id: 'user-123' } };

      expect(await controller.create(req, createTicketDto)).toEqual(mockTicket);
      expect(service.create).toHaveBeenCalledWith('user-123', createTicketDto);
    });
  });

  describe('findAll', () => {
    it('should return all tickets', async () => {
      expect(await controller.findAll()).toEqual([mockTicket]);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findUserTickets', () => {
    it('should return user tickets', async () => {
      const req = { user: { id: 'user-123' } };
      expect(await controller.findUserTickets(req)).toEqual([mockTicket]);
      expect(service.findUserTickets).toHaveBeenCalledWith('user-123');
    });
  });

  describe('findOne', () => {
    it('should return a ticket by id for admin', async () => {
      const req = { user: { id: 'admin-123', roles: [Role.ADMIN] } };
      expect(await controller.findOne(req, '123e4567-e89b-12d3-a456-426614174000')).toEqual(mockTicket);
      expect(service.findOne).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
    });

    it('should return a ticket by id for owner', async () => {
      const req = { user: { id: 'user-123' } };
      expect(await controller.findOne(req, '123e4567-e89b-12d3-a456-426614174000')).toEqual(mockTicket);
      expect(service.findOne).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000');
    });

    it('should throw forbidden exception if not admin or owner', async () => {
      const req = { user: { id: 'user-456' } };
      await expect(controller.findOne(req, '123e4567-e89b-12d3-a456-426614174000')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should update a ticket', async () => {
      const updateTicketDto = {
        response: 'This is a response',
      };

      const expected = {
        ...mockTicket,
        response: 'This is a response',
        status: TicketStatus.RESPONDED,
      };

      expect(await controller.update('123e4567-e89b-12d3-a456-426614174000', updateTicketDto)).toEqual(expected);
      expect(service.update).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', updateTicketDto);
    });
  });
});