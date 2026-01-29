import { NotificationType, NotificationStatus } from '../entities/notification.entity';

export class NotificationResponseDto {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  status: NotificationStatus;
  metadata?: Record<string, any>;
  relatedId?: string;
  actionUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  readAt?: Date;
}

export class PaginatedNotificationResponse {
  data: NotificationResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
