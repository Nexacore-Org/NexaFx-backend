import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SupportService } from './support.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../users/user.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { AdminUpdateTicketDto } from './dto/admin-update-ticket.dto';
import { AdminCreateMessageDto } from './dto/admin-create-message.dto';
import { AdminGetTicketsFilterDto } from './dto/admin-get-tickets-filter.dto';

@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('tickets')
  async createTicket(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateTicketDto,
  ) {
    return this.supportService.createTicket(user.userId, dto);
  }

  @Get('tickets')
  async listTickets(@CurrentUser() user: CurrentUserPayload) {
    return this.supportService.listUserTickets(user.userId);
  }

  @Get('tickets/:id')
  async getTicketDetail(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.supportService.getUserTicketDetail(id, user.userId);
  }

  @Post('tickets/:id/messages')
  async replyToTicket(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.supportService.replyToTicket(id, user.userId, dto);
  }

  @Post('tickets/:id/close')
  async closeTicket(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.supportService.closeTicket(id, user.userId);
  }
}

@Controller('admin/support')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('tickets')
  async listTickets(@Query() filters: AdminGetTicketsFilterDto) {
    return this.supportService.listAdminTickets(filters);
  }

  @Get('stats')
  async getStats() {
    return this.supportService.getAdminStats();
  }

  @Get('tickets/:id')
  async getTicketDetail(@Param('id', ParseUUIDPipe) id: string) {
    return this.supportService.getTicketDetailAdmin(id);
  }

  @Patch('tickets/:id')
  async updateTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateTicketDto,
  ) {
    return this.supportService.updateTicketAdmin(id, dto);
  }

  @Post('tickets/:id/messages')
  async replyToTicket(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminCreateMessageDto,
  ) {
    return this.supportService.replyToTicketAdmin(id, user.userId, dto);
  }
}
