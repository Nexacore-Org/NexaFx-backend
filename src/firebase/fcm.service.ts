import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import * as admin from 'firebase-admin';

@Injectable()
export class FCMService {
  private readonly logger = new Logger(FCMService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async sendPush(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, any>,
  ): Promise<void> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user) {
        this.logger.warn(`User ${userId} not found, skipping push notification.`);
        return;
      }

      // Fetch the token. We support fcmToken first, and fallback to fcmTokens[0]
      const token = user.fcmToken || (user.fcmTokens && user.fcmTokens[0]);

      if (!token) {
        this.logger.warn(`User ${userId} has no FCM token registered.`);
        return;
      }

      if (admin.apps.length === 0) {
        this.logger.warn(
          'Firebase Admin SDK is not initialized. Skipping push notification.',
        );
        return;
      }

      const stringifiedData: Record<string, string> = {};
      if (data) {
        for (const [key, value] of Object.entries(data)) {
          stringifiedData[key] = typeof value === 'string' ? value : JSON.stringify(value);
        }
      }

      const message: admin.messaging.Message = {
        token,
        notification: {
          title,
          body,
        },
        data: stringifiedData,
      };

      await admin.messaging().send(message);
      this.logger.log(`Push notification sent successfully to user ${userId}`);
    } catch (error) {
      // Constraint: "Push delivery failure must not throw — log error and continue"
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send push notification to user ${userId}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
