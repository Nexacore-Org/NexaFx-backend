import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicket, TicketStatus } from './entities/support-ticket.entity';
import { CreateTicketDto } from './dto/create-support-ticket.dto';
import { UpdateTicketDto } from './dto/update-support-ticket.dto';


@Injectable()
export class SupportTicketsService {
  constructor(
    @InjectRepository(SupportTicket)
    private supportTicketsRepository: Repository<SupportTicket>,
  ) {}

  async create(userId: string, createTicketDto: CreateTicketDto): Promise<SupportTicket> {
    const ticket = this.supportTicketsRepository.create({
      userId,
      ...createTicketDto,
      status: TicketStatus.OPEN,
    });
    return this.supportTicketsRepository.save(ticket);
  }

  async findAll(): Promise<SupportTicket[]> {
    return this.supportTicketsRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: string): Promise<SupportTicket> {
    const ticket = await this.supportTicketsRepository.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException(`Support ticket with ID "${id}" not found`);
    }
    return ticket;
  }

  async findUserTickets(userId: string): Promise<SupportTicket[]> {
    return this.supportTicketsRepository.find({
      where: { userId },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async update(id: string, updateTicketDto: UpdateTicketDto): Promise<SupportTicket> {
    const ticket = await this.findOne(id);
    
    // If providing a response, automatically set status to RESPONDED unless explicitly specified
    if (updateTicketDto.response && !updateTicketDto.status) {
      updateTicketDto.status = TicketStatus.RESPONDED;
    }
    
    // Update the ticket with the provided data
    const updatedTicket = { ...ticket, ...updateTicketDto };
    return this.supportTicketsRepository.save(updatedTicket);
  }

  async checkTicketOwnership(userId: string, ticketId: string): Promise<boolean> {
    const ticket = await this.findOne(ticketId);
    return ticket.userId === userId;
  }
}