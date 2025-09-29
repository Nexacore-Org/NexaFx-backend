import { ApiProperty } from '@nestjs/swagger';
import { Notifications } from '../entities/notification.entity';

export class NotificationResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  userId: string;

  @ApiProperty({ example: 'SYSTEM' })
  type: string;

  @ApiProperty({ example: 'INFO' })
  category: string;

  @ApiProperty({ example: 'System Update' })
  title: string;

  @ApiProperty({
    example: 'The system will be down for maintenance at midnight.',
  })
  message: string;

  @ApiProperty({ example: false })
  isRead: boolean;

  @ApiProperty({ example: 'HIGH' })
  priority: string;

  @ApiProperty({ example: 'Transaction', nullable: true })
  relatedEntityType?: string;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    nullable: true,
  })
  relatedEntityId?: string;

  @ApiProperty({ example: 'EMAIL' })
  channel: string;

  @ApiProperty({ example: '2024-09-28T12:00:00Z', nullable: true })
  expirationDate?: Date;

  @ApiProperty({
    example: 'https://app.nexafx.com/transaction/123',
    nullable: true,
  })
  actionUrl?: string;

  @ApiProperty({
    example: { transactionAmount: 1000, currency: 'USD' },
    nullable: true,
  })
  metadata?: Record<string, any>;

  @ApiProperty({ example: '2024-09-28T10:00:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2024-09-28T10:00:00Z' })
  updatedAt: Date;

  constructor(notification: Notifications) {
    this.id = notification.id;
    this.userId = notification.userId;
    this.type = notification.type;
    this.category = notification.category;
    this.title = notification.title;
    this.message = notification.message;
    this.isRead = notification.isRead;
    this.priority = notification.priority;
    this.relatedEntityType = notification.relatedEntityType;
    this.relatedEntityId = notification.relatedEntityId;
    this.channel = notification.channel;
    this.expirationDate = notification.expirationDate;
    this.actionUrl = notification.actionUrl;
    this.metadata = notification.metadata;
    this.createdAt = notification.createdAt;
    this.updatedAt = notification.updatedAt;
  }
}

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 25 })
  totalItems: number;

  @ApiProperty({ example: 3 })
  totalPages: number;

  @ApiProperty({ example: true })
  hasPreviousPage: boolean;

  @ApiProperty({ example: true })
  hasNextPage: boolean;
}

export class GetAllNotificationsResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  notifications: NotificationResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;

  @ApiProperty({
    example: {
      totalUnread: 5,
      totalRead: 20,
      lastNotificationDate: '2024-09-28T10:00:00Z',
    },
  })
  summary: {
    totalUnread: number;
    totalRead: number;
    lastNotificationDate?: Date;
  };
}
