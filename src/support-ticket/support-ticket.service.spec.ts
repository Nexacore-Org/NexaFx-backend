// src/support-tickets/support-tickets.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicketsService } from './support-tickets.service';
import { SupportTicket, TicketStatus } from './entities/support-ticket.entity';
import { NotFoundException } from '@nestjs/common';

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

describe('SupportTicketsService', () => {
  let service: SupportTicketsService;
  let repository: Repository<SupportTicket>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportTicketsService,
        {
          provide: getRepositoryToken(SupportTicket),
          useValue: {
            create: jest.fn().mockReturnValue(mockTicket),
            save: jest.fn().mockResolvedValue(mockTicket),
            find: jest.fn().mockResolvedValue([mockTicket]),
            findOne: jest.fn().mockResolvedValue(mockTicket),
          },
        },
      ],
    }).compile();

    service = module.get<SupportTicketsService>(SupportTicketsService);
    repository = module.get<Repository<SupportTicket>>(getRepositoryToken(SupportTicket));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new support ticket', async () => {
      const createTicketDto = {
        subject: 'Test Ticket',
        description: 'This is a test ticket',
      };

      expect(await service.create('user-123', createTicketDto)).toEqual(mockTicket);
      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-123',
        ...createTicketDto,
        status: TicketStatus.OPEN,
      });
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all tickets', async () => {
      expect(await service.findAll()).toEqual([mockTicket]);
      expect(repository.find).toHaveBeenCalledWith({
        order: {
          createdAt: 'DESC',
        },
      });
    });
  });

  describe('findOne', () => {
    it('should return a ticket by id', async () => {
      expect(await service.findOne('123e4567-e89b-12d3-a456-426614174000')).toEqual(mockTicket);
      expect(repository.findOne).toHaveBeenCalledWith({ 
        where: { id: '123e4567-e89b-12d3-a456-426614174000' } 
      });
    });

    it('should throw an error if ticket not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);
      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findUserTickets', () => {
    it('should return all tickets for a specific user', async () => {
      expect(await service.findUserTickets('user-123')).toEqual([mockTicket]);
      expect(repository.find).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        order: {
          createdAt: 'DESC',
        },
      });
    });
  });

  describe('update', () => {
    it('should update a ticket', async () => {
      const updateTicketDto = {
        response: 'This is a response',
      };

      const updatedMockTicket = {
        ...mockTicket,
        response: 'This is a response',
        status: TicketStatus.RESPONDED,
      };

      jest.spyOn(service, 'findOne').mockResolvedValueOnce(mockTicket);
      jest.spyOn(repository, 'save').mockResolvedValueOnce(updatedMockTicket as SupportTicket);

      expect(await service.update('123e4567-e89b-12d3-a456-426614174000', updateTicketDto)).toEqual(updatedMockTicket);
      expect(repository.save).toHaveBeenCalledWith({
        ...mockTicket,
        ...updateTicketDto,
        status: TicketStatus.RESPONDED,
      });
    });

    it('should respect explicitly provided status', async () => {
      const updateTicketDto = {
        response: 'This is a response',
        status: TicketStatus.CLOSED,
      };

      const updatedMockTicket = {
        ...mockTicket,
        response: 'This is a response',
        status: TicketStatus.CLOSED,
      };

      jest.spyOn(service, 'findOne').mockResolvedValueOnce(mockTicket);
      jest.spyOn(repository, 'save').mockResolvedValueOnce(updatedMockTicket as SupportTicket);

      expect(await service.update('123e4567-e89b-12d3-a456-426614174000', updateTicketDto)).toEqual(updatedMockTicket);
      expect(repository.save).toHaveBeenCalledWith({
        ...mockTicket,
        ...updateTicketDto,
      });
    });
  });

  describe('checkTicketOwnership', () => {
    it('should return true if user owns the ticket', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(mockTicket);
      expect(await service.checkTicketOwnership('user-123', '123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    });

    it('should return false if user does not own the ticket', async () => {
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(mockTicket);
      expect(await service.checkTicketOwnership('user-456', '123e4567-e89b-12d3-a456-426614174000')).toBe(false);
    });
  });
});