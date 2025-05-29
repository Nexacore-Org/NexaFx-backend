import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guard/jwt.auth.guard';
import { Roles } from 'src/common/decorators/roles.decorators';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CreateTicketDto } from './dto/create-support-ticket.dto';
import { UpdateTicketDto } from './dto/update-support-ticket.dto';
import { SupportTicket } from './entities/support-ticket.entity';
import { SupportTicketsService } from './support-ticket.service';
import { UserRole } from 'src/user/entities/user.entity';

@Controller('support-tickets')
export class SupportTicketsController {
  constructor(private readonly supportTicketsService: SupportTicketsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Req() req,
    @Body() createTicketDto: CreateTicketDto,
  ): Promise<SupportTicket> {
    const userId = req.user.id;
    return this.supportTicketsService.create(userId, createTicketDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
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
    const isAdmin = req.user.roles?.includes(UserRole.ADMIN) || false;
    const isOwner = ticket.userId === req.user.id;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException(
        'You do not have permission to access this ticket',
      );
    }

    return ticket;
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() updateTicketDto: UpdateTicketDto,
  ): Promise<SupportTicket> {
    return this.supportTicketsService.update(id, updateTicketDto);
  }
}
