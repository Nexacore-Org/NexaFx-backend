// src/notification-preferences/dto/create-notification-preference.dto.ts
import { IsBoolean, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CreateNotificationPreferenceDto {
  @IsNotEmpty()
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsBoolean()
  notifyOnTx?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnAnnouncements?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  smsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;
}