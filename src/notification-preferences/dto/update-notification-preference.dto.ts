// src/notification-preferences/dto/update-notification-preference.dto.ts
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferenceDto {
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