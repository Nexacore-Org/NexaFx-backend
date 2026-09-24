import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { SupportTicketPriority, SupportTicketStatus } from '../entities/support-ticket.entity';

export class AdminUpdateTicketDto {
  @IsEnum(SupportTicketPriority)
  @IsOptional()
  priority?: SupportTicketPriority;

  @IsEnum(SupportTicketStatus)
  @IsOptional()
  status?: SupportTicketStatus;

  @IsUUID()
  @IsOptional()
  assignedTo?: string | null;
}
