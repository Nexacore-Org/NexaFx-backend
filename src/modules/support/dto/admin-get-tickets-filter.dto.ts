import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { SupportTicketPriority, SupportTicketStatus } from '../entities/support-ticket.entity';

export class AdminGetTicketsFilterDto {
  @IsEnum(SupportTicketStatus)
  @IsOptional()
  status?: SupportTicketStatus;

  @IsEnum(SupportTicketPriority)
  @IsOptional()
  priority?: SupportTicketPriority;

  @IsUUID()
  @IsOptional()
  assignedTo?: string;

  @IsString()
  @IsOptional()
  breachedSla?: string;
}
