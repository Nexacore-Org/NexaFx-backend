import { ApiProperty } from '@nestjs/swagger';
import {
  PushNotification,
  PushNotificationStatus,
} from '../entities/push-notification.entity';

export class BroadcastResponseDto {
  @ApiProperty({
    description: 'Broadcast ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Notification title',
    example: 'New Feature Announcement',
  })
  title: string;

  @ApiProperty({
    description: 'Notification message body',
    example: 'We have launched a new feature for your convenience.',
  })
  message: string;

  @ApiProperty({
    description: 'Broadcast status',
    enum: PushNotificationStatus,
    example: PushNotificationStatus.ACTIVE,
  })
  status: PushNotificationStatus;

  @ApiProperty({
    description: 'ID of the admin who created this broadcast',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  sentBy: string;

  @ApiProperty({
    description: 'Number of users this broadcast was sent to',
    example: 150,
  })
  recipientCount: number;

  @ApiProperty({
    description: 'When the broadcast was created',
    example: '2025-02-25T10:30:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'When the broadcast was last updated',
    example: '2025-02-25T10:30:00Z',
  })
  updatedAt: Date;

  static fromEntity(entity: PushNotification): BroadcastResponseDto {
    const dto = new BroadcastResponseDto();
    dto.id = entity.id;
    dto.title = entity.title;
    dto.message = entity.message;
    dto.status = entity.status;
    dto.sentBy = entity.sentBy;
    dto.recipientCount = entity.recipientCount;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}

export class PaginatedBroadcastResponse {
  @ApiProperty({
    type: [BroadcastResponseDto],
    description: 'Array of broadcasts',
  })
  data: BroadcastResponseDto[];

  @ApiProperty({
    description: 'Total number of broadcasts',
    example: 50,
  })
  total: number;

  @ApiProperty({
    description: 'Current page number',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Number of items per page',
    example: 10,
  })
  limit: number;

  @ApiProperty({
    description: 'Total number of pages',
    example: 5,
  })
  totalPages: number;
}
