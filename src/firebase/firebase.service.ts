import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private initialized = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    try {
      const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.configService.get<string>(
        'FIREBASE_CLIENT_EMAIL',
      );
      const privateKeyStr = this.configService.get<string>(
        'FIREBASE_PRIVATE_KEY',
      );

      if (!projectId || !clientEmail || !privateKeyStr) {
        this.logger.warn(
          'Firebase credentials not fully configured. Push notifications will be disabled.',
        );
        return;
      }

      // Handle raw newlines in private key string if passed from .env
      const privateKey = privateKeyStr.replace(/\\n/g, '\n');

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

      this.initialized = true;
      this.logger.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to initialize Firebase Admin SDK: ${errorMessage}`,
      );
    }
  }

  async sendToTokens(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.initialized) {
      this.logger.warn(
        'Firebase is not initialized. Skipping push notification delivery.',
      );
      return;
    }

    if (!tokens || tokens.length === 0) {
      return;
    }

    try {
      const message: admin.messaging.MulticastMessage = {
        notification: {
          title,
          body,
        },
        tokens,
      };

      if (data) {
        message.data = data;
      }

      const response = await admin.messaging().sendEachForMulticast(message);

      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(tokens[idx]);
            this.logger.warn(
              `Failed to send to token ${tokens[idx]}: ${resp.error?.message}`,
            );
          }
        });

        // In the future, we can clean up these failed tokens from the user's fcmTokens array
        this.logger.log(
          `FCM send complete: ${response.successCount} successful, ${response.failureCount} failed.`,
        );
      } else {
        this.logger.log(
          `FCM send successful to ${response.successCount} tokens.`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error sending push notifications: ${errorMessage}`,
        error,
      );
      // We don't rethrow to avoid blocking main flows since notifications are secondary
    }
  }
}
