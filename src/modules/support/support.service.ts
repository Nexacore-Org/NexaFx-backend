import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import * as FormData from 'form-data';
import Mailgun from 'mailgun.js';

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
import { AuditEntityType } from '../../audit-logs/enums/audit-entity-type.enum';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/entities/notification.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { AdminUpdateTicketDto } from './dto/admin-update-ticket.dto';
import { AdminCreateMessageDto } from './dto/admin-create-message.dto';
import { AdminGetTicketsFilterDto } from './dto/admin-get-tickets-filter.dto';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @InjectRepository(SupportTicket)
    private readonly supportTicketRepository: Repository<SupportTicket>,
    @InjectRepository(TicketMessage)
    private readonly ticketMessageRepository: Repository<TicketMessage>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * User: Create a support ticket
   */
  async createTicket(userId: string, dto: CreateTicketDto): Promise<SupportTicket> {
    const priority = dto.priority ?? SupportTicketPriority.LOW;
    const slaDeadlineAt = this.calculateSlaDeadline(priority);

    // Save ticket and the initial message in a single database transaction
    const savedTicket = await this.dataSource.transaction(async (manager) => {
      const ticket = manager.create(SupportTicket, {
        userId,
        subject: dto.subject,
        category: dto.category,
        priority,
        slaDeadlineAt,
        status: SupportTicketStatus.OPEN,
      });
      const saved = await manager.save(ticket);

      const message = manager.create(TicketMessage, {
        ticketId: saved.id,
        authorId: userId,
        authorRole: TicketMessageAuthorRole.USER,
        body: dto.body,
        isInternal: false,
      });
      await manager.save(message);

      return saved;
    });

    // Log ticket creation audit log
    await this.auditLogsService.createLog({
      userId,
      action: 'TICKET_CREATE',
      entity: AuditEntityType.USER,
      entityId: savedTicket.id,
      metadata: {
        ticketNumber: savedTicket.ticketNumber,
        category: savedTicket.category,
        priority: savedTicket.priority,
      },
    });

    // Send confirmation email asynchronously
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (user?.email) {
      const emailSubject = `[${savedTicket.ticketNumber}]`;
      const emailBody = `Hello ${user.firstName || 'User'},\n\nYour support ticket has been successfully created.\n\nTicket Number: ${savedTicket.ticketNumber}\nSubject: ${savedTicket.subject}\nCategory: ${savedTicket.category}\nPriority: ${savedTicket.priority}\n\nOur support team will get back to you shortly.\n\nBest regards,\nNexaFX Support Team`;
      this.sendEmail(user.email, emailSubject, emailBody).catch((err) =>
        this.logger.error(`Failed sending confirmation email: ${err.message}`),
      );
    }

    return savedTicket;
  }

  /**
   * User: List own support tickets
   */
  async listUserTickets(userId: string): Promise<SupportTicket[]> {
    return this.supportTicketRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * User: Get ticket detail with non-internal messages (at query level)
   */
  async getUserTicketDetail(ticketId: string, userId: string): Promise<SupportTicket> {
    const ticket = await this.supportTicketRepository.createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.messages', 'message', 'message.isInternal = :isInternal', { isInternal: false })
      .leftJoinAndSelect('ticket.assignedToUser', 'assignedToUser')
      .where('ticket.id = :ticketId AND ticket.userId = :userId', { ticketId, userId })
      .orderBy('message.createdAt', 'ASC')
      .getOne();

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found.`);
    }

    return ticket;
  }

  /**
   * User: Reply to support ticket
   */
  async replyToTicket(ticketId: string, userId: string, dto: CreateMessageDto): Promise<TicketMessage> {
    const ticket = await this.supportTicketRepository.findOne({
      where: { id: ticketId, userId },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found.`);
    }

    if (ticket.status === SupportTicketStatus.CLOSED) {
      throw new BadRequestException('Cannot reply to a closed ticket.');
    }

    const message = this.ticketMessageRepository.create({
      ticketId,
      authorId: userId,
      authorRole: TicketMessageAuthorRole.USER,
      body: dto.body,
      isInternal: false,
    });

    const savedMessage = await this.ticketMessageRepository.save(message);

    // If status is RESOLVED, reopen it since the user replied
    if (ticket.status === SupportTicketStatus.RESOLVED) {
      ticket.status = SupportTicketStatus.IN_PROGRESS;
      ticket.resolvedAt = null;
      await this.supportTicketRepository.save(ticket);
    }

    // Notify assigned admin if present
    if (ticket.assignedTo) {
      const admin = await this.userRepository.findOne({
        where: { id: ticket.assignedTo },
      });
      if (admin?.email) {
        const emailSubject = `Re: [${ticket.ticketNumber}]`;
        const emailBody = `Hello ${admin.firstName || 'Admin'},\n\nThe user has replied to ticket ${ticket.ticketNumber}.\n\nMessage:\n"${dto.body}"\n\nPlease view the admin dashboard to respond.`;
        this.sendEmail(admin.email, emailSubject, emailBody).catch((err) =>
          this.logger.error(`Failed sending admin reply notification: ${err.message}`),
        );
      }
    }

    return savedMessage;
  }

  /**
   * User: Close ticket
   */
  async closeTicket(ticketId: string, userId: string): Promise<SupportTicket> {
    const ticket = await this.supportTicketRepository.findOne({
      where: { id: ticketId, userId },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found.`);
    }

    ticket.status = SupportTicketStatus.CLOSED;
    ticket.closedAt = new Date();
    const saved = await this.supportTicketRepository.save(ticket);

    // Log closing ticket
    await this.auditLogsService.createLog({
      userId,
      action: 'TICKET_CLOSE',
      entity: AuditEntityType.USER,
      entityId: ticket.id,
      metadata: {
        ticketNumber: ticket.ticketNumber,
      },
    });

    return saved;
  }

  /**
   * Admin: List support tickets in queue with filters
   */
  async listAdminTickets(filters: AdminGetTicketsFilterDto): Promise<SupportTicket[]> {
    const query = this.supportTicketRepository.createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.user', 'user')
      .leftJoinAndSelect('ticket.assignedToUser', 'assignedToUser');

    if (filters.status) {
      query.andWhere('ticket.status = :status', { status: filters.status });
    }

    if (filters.priority) {
      query.andWhere('ticket.priority = :priority', { priority: filters.priority });
    }

    if (filters.assignedTo) {
      query.andWhere('ticket.assignedTo = :assignedTo', { assignedTo: filters.assignedTo });
    }

    if (filters.breachedSla !== undefined) {
      const isBreached = filters.breachedSla === 'true';
      query.andWhere('ticket.isSlaBreached = :isBreached', { isBreached });
    }

    query.orderBy('ticket.createdAt', 'DESC');
    return query.getMany();
  }

  /**
   * Admin: Get ticket details including internal messages
   */
  async getTicketDetailAdmin(ticketId: string): Promise<SupportTicket> {
    const ticket = await this.supportTicketRepository.createQueryBuilder('ticket')
      .leftJoinAndSelect('ticket.messages', 'message')
      .leftJoinAndSelect('ticket.user', 'user')
      .leftJoinAndSelect('ticket.assignedToUser', 'assignedToUser')
      .where('ticket.id = :ticketId', { ticketId })
      .orderBy('message.createdAt', 'ASC')
      .getOne();

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found.`);
    }

    return ticket;
  }

  /**
   * Admin: Update ticket details
   */
  async updateTicketAdmin(ticketId: string, dto: AdminUpdateTicketDto): Promise<SupportTicket> {
    const ticket = await this.supportTicketRepository.findOne({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found.`);
    }

    if (dto.priority !== undefined) {
      ticket.priority = dto.priority;
    }

    if (dto.assignedTo !== undefined) {
      ticket.assignedTo = dto.assignedTo;
    }

    if (dto.status !== undefined) {
      ticket.status = dto.status;
      if (dto.status === SupportTicketStatus.RESOLVED) {
        ticket.resolvedAt = new Date();
        ticket.closedAt = null;
      } else if (dto.status === SupportTicketStatus.CLOSED) {
        ticket.closedAt = new Date();
        ticket.resolvedAt = null;
      } else {
        ticket.resolvedAt = null;
        ticket.closedAt = null;
      }
    }

    const saved = await this.supportTicketRepository.save(ticket);

    // Log update
    await this.auditLogsService.createLog({
      action: 'TICKET_UPDATE_ADMIN',
      entity: AuditEntityType.SYSTEM,
      entityId: ticket.id,
      metadata: {
        ticketNumber: ticket.ticketNumber,
        updatedFields: dto,
      },
    });

    return saved;
  }

  /**
   * Admin: Reply to ticket
   */
  async replyToTicketAdmin(ticketId: string, adminId: string, dto: AdminCreateMessageDto): Promise<TicketMessage> {
    const ticket = await this.supportTicketRepository.findOne({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found.`);
    }

    const isInternal = dto.isInternal ?? false;

    const message = this.ticketMessageRepository.create({
      ticketId,
      authorId: adminId,
      authorRole: TicketMessageAuthorRole.ADMIN,
      body: dto.body,
      isInternal,
      attachmentKeys: dto.attachmentKeys ?? null,
    });

    const savedMessage = await this.ticketMessageRepository.save(message);

    // If it's a public reply, we update the ticket status to PENDING_USER and notify the user
    if (!isInternal) {
      ticket.status = SupportTicketStatus.PENDING_USER;
      await this.supportTicketRepository.save(ticket);

      const user = await this.userRepository.findOne({
        where: { id: ticket.userId },
      });
      if (user?.email) {
        const emailSubject = `Re: [${ticket.ticketNumber}]`;
        const emailBody = `Hello ${user.firstName || 'User'},\n\nOur support team has replied to your ticket ${ticket.ticketNumber}.\n\nMessage:\n"${dto.body}"\n\nPlease log in to view the ticket and reply if needed.\n\nBest regards,\nNexaFX Support Team`;
        this.sendEmail(user.email, emailSubject, emailBody).catch((err) =>
          this.logger.error(`Failed sending user reply notification: ${err.message}`),
        );
      }
    }

    return savedMessage;
  }

  /**
   * Admin: Get support dashboard statistics
   */
  async getAdminStats() {
    // Open tickets by priority
    const openTicketsRaw = await this.supportTicketRepository.createQueryBuilder('ticket')
      .select('ticket.priority', 'priority')
      .addSelect('COUNT(*)', 'count')
      .where('ticket.status NOT IN (:...closedStatuses)', {
        closedStatuses: [SupportTicketStatus.RESOLVED, SupportTicketStatus.CLOSED],
      })
      .groupBy('ticket.priority')
      .getRawMany();

    const openTicketsByPriority = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      URGENT: 0,
    };
    for (const row of openTicketsRaw) {
      if (row.priority in openTicketsByPriority) {
        openTicketsByPriority[row.priority] = parseInt(row.count, 10);
      }
    }

    // SLA breach count
    const slaBreachCount = await this.supportTicketRepository.count({
      where: { isSlaBreached: true },
    });

    // Average resolution time (in hours)
    const avgResRaw = await this.supportTicketRepository.createQueryBuilder('ticket')
      .select('AVG(EXTRACT(EPOCH FROM (ticket.resolvedAt - ticket.createdAt)) / 3600)', 'avgHours')
      .where('ticket.resolvedAt IS NOT NULL')
      .getRawOne();

    const avgResolutionTime = parseFloat(avgResRaw?.avgHours || '0');

    return {
      openTicketsByPriority,
      slaBreachCount,
      avgResolutionTime,
    };
  }

  /**
   * Cron job running every 15 minutes to flag SLA breaches
   */
  @Cron('0 */15 * * * *')
  async handleSlaBreaches(): Promise<void> {
    this.logger.log('SLA Breach Check running...');
    try {
      const now = new Date();
      const breachedTickets = await this.supportTicketRepository.find({
        where: {
          status: In([SupportTicketStatus.OPEN, SupportTicketStatus.IN_PROGRESS]),
          slaDeadlineAt: LessThan(now),
          isSlaBreached: false,
        },
      });

      if (breachedTickets.length === 0) {
        this.logger.log('No new SLA breaches detected.');
        return;
      }

      this.logger.log(`Found ${breachedTickets.length} tickets that breached SLA. Escalating...`);

      for (const ticket of breachedTickets) {
        ticket.priority = SupportTicketPriority.URGENT;
        ticket.isSlaBreached = true;
        await this.supportTicketRepository.save(ticket);

        // Create SLA breach audit log
        await this.auditLogsService.createLog({
          action: 'TICKET_SLA_BREACH',
          entity: AuditEntityType.SYSTEM,
          entityId: ticket.id,
          metadata: {
            ticketNumber: ticket.ticketNumber,
            slaDeadlineAt: ticket.slaDeadlineAt,
            subject: ticket.subject,
          },
        });

        // Send notifications to the admin team
        await this.notifyAdminTeam(ticket);
      }
    } catch (error: any) {
      this.logger.error(`SLA breach cron failed: ${error.message}`, error.stack);
    }
  }

  /**
   * Calculate ticket SLA deadline based on priority and environment variables
   */
  private calculateSlaDeadline(priority: SupportTicketPriority): Date {
    const slaHoursLow = this.configService.get<number>('SLA_HOURS_LOW') ?? 72;
    const slaHoursMedium = this.configService.get<number>('SLA_HOURS_MEDIUM') ?? 24;
    const slaHoursHigh = this.configService.get<number>('SLA_HOURS_HIGH') ?? 8;
    const slaHoursUrgent = this.configService.get<number>('SLA_HOURS_URGENT') ?? 2;

    let hours = slaHoursLow;
    switch (priority) {
      case SupportTicketPriority.URGENT:
        hours = slaHoursUrgent;
        break;
      case SupportTicketPriority.HIGH:
        hours = slaHoursHigh;
        break;
      case SupportTicketPriority.MEDIUM:
        hours = slaHoursMedium;
        break;
      case SupportTicketPriority.LOW:
      default:
        hours = slaHoursLow;
        break;
    }

    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  /**
   * Helper to create system notifications for the admin team
   */
  private async notifyAdminTeam(ticket: SupportTicket): Promise<void> {
    try {
      const admins = await this.userRepository.find({
        where: [
          { role: UserRole.ADMIN },
          { role: UserRole.SUPER_ADMIN },
        ],
      });

      for (const admin of admins) {
        await this.notificationsService.create({
          userId: admin.id,
          type: NotificationType.SYSTEM,
          title: `SLA Breach: ${ticket.ticketNumber}`,
          message: `Ticket ${ticket.ticketNumber} has breached its SLA. Priority escalated to URGENT.`,
          relatedId: ticket.id,
        }).catch((err) =>
          this.logger.error(`Failed to notify admin ${admin.id}: ${err.message}`),
        );
      }
    } catch (error: any) {
      this.logger.error(`Failed to notify admin team: ${error.message}`, error.stack);
    }
  }

  /**
   * Send text email using Mailgun API
   */
  private async sendEmail(to: string, subject: string, text: string): Promise<void> {
    const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
    const domain = this.configService.get<string>('MAILGUN_DOMAIN');
    const fromEmail = this.configService.get<string>('MAILGUN_FROM_EMAIL');
    const fromName = this.configService.get<string>('MAILGUN_FROM_NAME') ?? 'NexaFX Support';

    if (!apiKey || !domain || !fromEmail) {
      this.logger.warn(
        `Email not sent: Mailgun is not configured (MAILGUN_API_KEY, MAILGUN_DOMAIN, or MAILGUN_FROM_EMAIL is missing)`,
      );
      return;
    }

    try {
      const mailgun = new Mailgun(FormData);
      const client = mailgun.client({ username: 'api', key: apiKey });

      await client.messages.create(domain, {
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject,
        text,
      });
      this.logger.log(`Email sent successfully to ${to} with subject "${subject}"`);
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`, error.stack);
    }
  }
}
