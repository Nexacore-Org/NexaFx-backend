import { IsString, IsEmail } from 'class-validator';

export class ScheduleAuditLogDeliveryDto {
  @IsEmail()
  email: string;
}
