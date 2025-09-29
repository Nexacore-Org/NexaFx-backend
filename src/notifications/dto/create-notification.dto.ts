import {
  IsDate,
  IsEnum,
  IsJSON,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationCategory } from '../enum/notificationCategory.enum';
import { NotificationPriority } from '../enum/notificationPriority.enum';
import { Type } from 'class-transformer';
import { NotificationChannel } from '../enum/notificationChannel.enum';
import { NotificationType } from '../enum/notificationType.enum';

export class CreateNotificationDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: NotificationType, example: NotificationType.SYSTEM })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiPropertyOptional({
    enum: NotificationCategory,
    example: NotificationCategory.INFO,
  })
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @ApiProperty({ example: 'System Update' })
  @IsString()
  @Length(1, 255)
  title: string;

  @ApiProperty({
    example: 'The system will be down for maintenance at midnight.',
  })
  @IsString()
  message: string;

  @ApiPropertyOptional({
    enum: NotificationPriority,
    example: NotificationPriority.HIGH,
  })
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiProperty({
    enum: NotificationChannel,
    example: NotificationChannel.EMAIL,
  })
  @IsEnum(NotificationChannel)
  channel: NotificationChannel;

  @ApiPropertyOptional({ example: 'Transaction' })
  @IsOptional()
  @IsString()
  relatedEntityType?: string;

  @ApiPropertyOptional({ example: '987e6543-e21b-12d3-a456-426614174000' })
  @IsOptional()
  @IsUUID()
  relatedEntityId?: string;

  @ApiPropertyOptional({ example: '2024-07-01T10:00:00Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expirationDate?: Date;

  @ApiPropertyOptional({ example: 'https://example.com/action' })
  @IsOptional()
  @IsString()
  actionUrl?: string;

  @ApiPropertyOptional({ example: { key: 'value' } })
  @IsOptional()
  @IsJSON()
  metadata?: Record<string, any>;
}
