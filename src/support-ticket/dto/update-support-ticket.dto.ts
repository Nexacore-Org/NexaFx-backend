import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TicketStatus } from '../entities/support-ticket.entity';

export class UpdateTicketDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  response?: string;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;
}