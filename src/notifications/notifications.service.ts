import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { resolveDeepLink, buildFcmData } from './deep-links.registry';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { FCMService } from '../firebase/fcm.service';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../modules/mail/mail.service';
import { NotificationsGateway } from './notifications.gateway';

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
    private readonly mailService: MailService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async create(dto: CreateNotificationDto): Promise<Notification>;
  async create(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<Notification>;
  async create(
    userIdOrDto: string | CreateNotificationDto,
    type?: NotificationType,
    title?: string,
    body?: string,
    data?: Record<string, any>,
  ): Promise<Notification> {
    try {
      let notification: Notification;
      if (typeof userIdOrDto === 'string') {
        const resolvedData = this.resolveActionUrl(
          type as NotificationType,
          data,
        );
        notification = this.notificationRepository.create({
          userId: userIdOrDto,
          type: type as NotificationType,
          title: title as string,
          body: body as string,
          data: resolvedData,
        });
      } else {
        const dto = userIdOrDto;
        const deepLink =
          dto.actionUrl ??
          resolveDeepLink(dto.type, {
            notificationId: '',
            resourceId: (dto as any).relatedId,
          });

        const metadata = dto.metadata || {};
        const mergedData = { ...metadata, actionUrl: deepLink };

        notification = this.notificationRepository.create({
          userId: dto.userId,
          type: dto.type,
          title: dto.title,
          body: dto.message || '',
          data: mergedData,
        });
      }

      const saved = await this.notificationRepository.save(notification);
      this.emitToUser(saved);
      return saved;
    } catch (error) {
      this.logger.error('Failed to create notification', error);
      throw new BadRequestException('Failed to create notification');
    }
  }

  /**
   * Resolve a deep link for a notification type + data payload and store it
   * under data.actionUrl so clients (and FCM) can navigate to the right screen.
   */
  private resolveActionUrl(
    type: NotificationType,
    data?: Record<string, any>,
  ): Record<string, any> {
    const base = data ? { ...data } : {};
    if (base.actionUrl) {
      return base;
    }

    const resourceId =
      base.transactionId ?? base.resourceId ?? base.relatedId ?? undefined;

    const actionUrl = resolveDeepLink(type, {
      notificationId: base.notificationId ?? '',
      resourceId,
    });

    if (actionUrl) {
      base.actionUrl = actionUrl;
    }
    return base;
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

      const prefs = (user as any).notificationPreferences || {
        email: true,
        push: true,
        types: { TRANSACTION: true, KYC: true, RATE_ALERT: true },
      };

      // Check if this type is enabled for the user
      const isTypeEnabled = prefs.types?.[type] !== false;

      if (!isTypeEnabled) {
        this.logger.log(
          `Notification type ${type} is disabled for user ${userId}. Skipping delivery.`,
        );
        return notification;
      }

      // 3. Send FCM push if push preference is enabled (opt-in based on user preferences)
      if (prefs.push === true) {
        const notificationData = (notification.data || {}) as Record<
          string,
          any
        >;
        const fcmData = buildFcmData(type, notificationData);
        await this.fcmService.sendPush(userId, title, body, fcmData);
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

  /**
   * Emit a newly created notification to the user's real-time socket room.
   * Failures here must never break the notification creation flow.
   */
  private emitToUser(notification: Notification): void {
    try {
      this.notificationsGateway.sendToUser(notification.userId, notification);
    } catch (error) {
      this.logger.error(
        `Failed to emit real-time notification for user ${notification.userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Create and deliver a notification from a compact payload, e.g. when a
   * background job (like statement generation) notifies a user.
   */
  async createAndSend(
    userId: string,
    payload: { title: string; body: string; type: NotificationType },
  ): Promise<Notification> {
    return this.dispatch(userId, payload.type, payload.title, payload.body);
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

  /**
   * Escape user-influenced text before interpolating it into the branded
   * HTML email template to prevent HTML/link injection.
   */
  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

    const safeSubject = this.escapeHtml(subject);
    const safeBody = this.escapeHtml(body);

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
        <h2 style="color: #333;">${safeSubject}</h2>
        <p style="font-size: 16px; color: #555; line-height: 1.5;">${safeBody}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #999; text-align: center;">This is an automated notification from NexaFX.</p>
      </div>
    `;

    try {
      await this.mailService.enqueueEmail({
        to,
        subject,
        html,
        text: body,
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue notification email to ${to}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
