export class CreateSupportTicketDto {}
// src/support-tickets/dto/create-ticket.dto.ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateTicketDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  subject: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  description: string;
}