import {
  IsDate,
  IsEnum,
  IsJSON,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { NotificationType } from '../enum/notificationType.enum';
import { NotificationCategory } from '../enum/notificationCategory.enum';
import { NotificationPriority } from '../enum/notificationPriority.enum';
import { NotificationChannel } from '../enum/notificationChannel.enum';
import { Type } from 'class-transformer';

export class CreateNotificationDto {
  @IsUUID()
  userId: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsEnum(NotificationCategory)
  category: NotificationCategory;

  @IsString()
  @Length(1, 255)
  title: string;

  @IsString()
  message: string;

  @IsEnum(NotificationPriority)
  priority: NotificationPriority;

  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @IsOptional()
  @IsString()
  relatedEntityType?: string;

  @IsOptional()
  @IsUUID()
  relatedEntityId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expirationDate?: Date;

  @IsOptional()
  @IsString()
  actionUrl?: string;

  @IsOptional()
  @IsJSON()
  metadata?: any;
}
