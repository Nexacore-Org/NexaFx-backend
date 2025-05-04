import { Controller, Get, Post, Patch, Body, Param, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { SupportTicketsService } from './support-tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { SupportTicket } from './entities/support-ticket.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../users/enums/role.enum';

@Controller('support-tickets')
export class SupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req, @Body() createTicketDto: CreateTicketDto): Promise<SupportTicket> {
    const userId = req.user.id;
    return this.supportTicketsService.create(userId, createTicketDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async findAll(): Promise<SupportTicket[]> {
    return this.supportTicketsService.findAll();
  }

  @Get('my-tickets')
  @UseGuards(JwtAuthGuard)
  async findUserTickets(@Req() req): Promise<SupportTicket[]> {
    const userId = req.user.id;
    return this.supportTicketsService.findUserTickets(userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Req() req, @Param('id') id: string): Promise<SupportTicket> {
    const ticket = await this.supportTicketsService.findOne(id);
    
    // Check if the user is the owner of the ticket or an admin
    const isAdmin = req.user.roles?.includes(Role.ADMIN) || false;
    const isOwner = ticket.userId === req.user.id;
    
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('You do not have permission to access this ticket');
    }
    
    return ticket;
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateTicketDto: UpdateTicketDto,
  ): Promise<SupportTicket> {
    return this.supportTicketsService.update(id, updateTicketDto);
  }
}