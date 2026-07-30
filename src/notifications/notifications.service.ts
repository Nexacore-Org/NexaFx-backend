import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Repository, In } from 'typeorm';
import {
  Notification,
  NotificationStatus,
  NotificationType,
} from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { resolveDeepLink } from './deep-links.registry';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import {
  NotificationResponseDto,
  PaginatedNotificationResponse,
} from './dto/notification-response.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { User } from '../users/user.entity';
import { FCMService } from '../firebase/fcm.service';
import { ConfigService } from '@nestjs/config';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly fcmService: FCMService,
    private readonly configService: ConfigService,
  ) {}

  async create(
    createNotificationDto: CreateNotificationDto,
  ): Promise<NotificationResponseDto | null> {
    try {
      const preference = await this.preferenceService.getPreference(
        createNotificationDto.userId,
        createNotificationDto.type,
      );

      if (
        !(await this.preferenceService.isChannelEnabled(
          createNotificationDto.userId,
          createNotificationDto.type,
          'inApp',
        ))
      ) {
        return null;
      }

      const deepLink =
        createNotificationDto.actionUrl ??
        resolveDeepLink(createNotificationDto.type, {
          notificationId: '',
          resourceId: createNotificationDto.relatedId,
        });

      const dtoWithDeepLink = { ...createNotificationDto, actionUrl: deepLink };

      const notification = this.notificationsRepository.create(
        preference.digestMode === NotificationDigestMode.IMMEDIATE
          ? dtoWithDeepLink
          : {
              ...dtoWithDeepLink,
              metadata: {
                ...(createNotificationDto.metadata ?? {}),
                digestMode: preference.digestMode,
                digestPending: true,
              },
            },
      );
      const saved = await this.notificationsRepository.save(notification);
      return this.mapToResponseDto(saved);
    } catch (error) {
      this.logger.error('Failed to create notification', error);
      throw new BadRequestException('Failed to create notification');
    }
  }
  async updateBatchStatus(
    notificationIds: string[],
    status: NotificationStatus,
  ): Promise<{ updated: number }> {
    if (!notificationIds || notificationIds.length === 0) {
      throw new BadRequestException('Notification IDs are required');
    }

    const result = await this.notificationsRepository.update(
      { id: In(notificationIds) },
      { status },
    );

    return { updated: result.affected || 0 };
  }

  async dispatch(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<Notification> {
    // 1. Create the in-app notification record in the DB
    const notification = await this.create(userId, type, title, body, data);

    try {
      // 2. Fetch the user and their notification preferences
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        this.logger.warn(
          `User ${userId} not found during notification dispatch.`,
        );
        return notification;
      }

      const prefs = user.notificationPreferences || {
        email: true,
        push: true,
        types: { TRANSACTION: true, KYC: true, RATE_ALERT: true },
      };

      // Check if this type is enabled for the user
      const isTypeEnabled =
        type === NotificationType.SYSTEM || prefs.types?.[type] !== false;

      if (!isTypeEnabled) {
        this.logger.log(
          `Notification type ${type} is disabled for user ${userId}. Skipping delivery.`,
        );
        return notification;
      }

      // 3. Send FCM push if push preference is enabled (opt-in based on user preferences)
      if (prefs.push === true) {
        await this.fcmService.sendPush(userId, title, body, data);
      }

      // 4. Send email if email preference is enabled (opt-in based on user preferences)
      if (prefs.email === true && user.email) {
        await this.sendEmail(user.email, title, body);
      }
    } catch (error) {
      // Catch and log dispatch errors to ensure main flows are not blocked
      this.logger.error(
        `Failed to deliver dispatch notifications for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return notification;
  }

  async getNotifications(
    userId: string,
    page: number = 1,
    limit: number = 10,
    isRead?: boolean,
  ) {
    const where: any = { userId };
    if (isRead !== undefined) {
      where.isRead = isRead;
    }

    const [data, total] = await this.notificationRepository
      .createQueryBuilder('notification')
      .where(where)
      .orderBy('notification.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async markAsRead(userId: string, id: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID ${id} not found.`);
    }

    notification.isRead = true;
    notification.readAt = new Date();
    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return { updated: result.affected || 0 };
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notificationRepository.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  private async sendEmail(
    to: string,
    subject: string,
    body: string,
  ): Promise<void> {
    const skipEmail = this.configService.get<string>('SKIP_EMAIL_SENDING');

    if (skipEmail === 'true') {
      this.logger.log(
        `[EMAIL DEV] Email skipped — to: ${to}, subject: ${subject}, body: ${body}`,
      );
      return;
    }

    const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
    const domain = this.configService.get<string>('MAILGUN_DOMAIN');
    const fromEmail = this.configService.get<string>('MAILGUN_FROM_EMAIL');
    const fromName =
      this.configService.get<string>('MAILGUN_FROM_NAME') ?? 'NexaFX';

    if (!apiKey || !domain || !fromEmail) {
      this.logger.error(
        'Missing Mailgun configuration: MAILGUN_API_KEY, MAILGUN_DOMAIN, and MAILGUN_FROM_EMAIL are required',
      );
      return;
    }

    try {
      const mailgun = new Mailgun(FormData);
      const client = mailgun.client({ username: 'api', key: apiKey });

      await client.messages.create(domain, {
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject: subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
            <h2 style="color: #333;">${subject}</h2>
            <p style="font-size: 16px; color: #555; line-height: 1.5;">${body}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #999; text-align: center;">This is an automated notification from NexaFX.</p>
          </div>
        `,
        text: body,
      });
      this.logger.log(`Email sent successfully to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${to}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
