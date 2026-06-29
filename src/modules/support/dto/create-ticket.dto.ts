import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SupportTicketCategory, SupportTicketPriority } from '../entities/support-ticket.entity';

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsEnum(SupportTicketCategory)
  @IsNotEmpty()
  category: SupportTicketCategory;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsEnum(SupportTicketPriority)
  @IsOptional()
  priority?: SupportTicketPriority;
}
