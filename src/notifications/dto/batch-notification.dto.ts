import { IsArray, IsUUID, IsEnum } from 'class-validator';
import { NotificationStatus } from '../entities/notification.entity';

export class BatchMarkAsReadDto {
  @IsArray()
  @IsUUID('4', { each: true })
  notificationIds: string[];
}

export class BatchDeleteDto {
  @IsArray()
  @IsUUID('4', { each: true })
  notificationIds: string[];
}

export class BatchUpdateStatusDto {
  @IsArray()
  @IsUUID('4', { each: true })
  notificationIds: string[];

  @IsEnum(NotificationStatus)
  status: NotificationStatus;
}

export class MarkAllAsReadDto {}
