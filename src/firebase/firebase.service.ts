import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';
import { User } from '../users/user.entity';
import {
  isPrunableFcmErrorCode,
  maskFcmToken,
  stringifyFcmData,
} from './fcm.service';

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private initialized = false;
  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @InjectRepository(User)
    private readonly userRepository?: Repository<User>,
  ) {}

  onModuleInit() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    try {
      if (getApps().length > 0) {
        this.initialized = true;
        this.logger.log('Firebase Admin SDK already initialized');
        return;
      }

      const serviceAccountJson = this.configService.get<string>(
        'FIREBASE_SERVICE_ACCOUNT_JSON',
      );

      let credentialConfig: any = null;

      if (serviceAccountJson) {
        try {
          const serviceAccount = JSON.parse(serviceAccountJson);
          credentialConfig = {
            projectId: serviceAccount.project_id || serviceAccount.projectId,
            clientEmail:
              serviceAccount.client_email || serviceAccount.clientEmail,
            privateKey: (
              serviceAccount.private_key || serviceAccount.privateKey
            )?.replace(/\\n/g, '\n'),
          };
        } catch (jsonError) {
          this.logger.error(
            `Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: ${(jsonError as any).message}`,
          );
        }
      }

      if (!credentialConfig) {
        const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
        const clientEmail = this.configService.get<string>(
          'FIREBASE_CLIENT_EMAIL',
        );
        const privateKeyStr = this.configService.get<string>(
          'FIREBASE_PRIVATE_KEY',
        );

        if (projectId && clientEmail && privateKeyStr) {
          credentialConfig = {
            projectId,
            clientEmail,
            privateKey: privateKeyStr.replace(/\\n/g, '\n'),
          };
        }
      }

      if (
        !credentialConfig ||
        !credentialConfig.projectId ||
        !credentialConfig.clientEmail ||
        !credentialConfig.privateKey
      ) {
        this.logger.warn(
          'Firebase credentials not fully configured. Push notifications will be disabled.',
        );
        return;
      }

      initializeApp({
        credential: cert({
          projectId: credentialConfig.projectId,
          clientEmail: credentialConfig.clientEmail,
          privateKey: credentialConfig.privateKey,
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
    structuredData?: Record<string, string>,
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
      const mergedData = stringifyFcmData({
        ...(data ?? {}),
        ...(structuredData ?? {}),
      });

      const message: MulticastMessage = {
        notification: {
          title,
          body,
        },
        tokens,
      };

      if (Object.keys(mergedData).length > 0) {
        message.data = mergedData;
      }

      const response = await getMessaging().sendEachForMulticast(message);

      if (response.failureCount > 0) {
        const deadTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const token = tokens[idx];
            const errorCode = (resp.error as any)?.code;
            this.logger.warn(
              `Failed to send to token ${maskFcmToken(token)} (${errorCode ?? 'unknown'}): ${resp.error?.message}`,
            );
            if (isPrunableFcmErrorCode(errorCode)) {
              deadTokens.push(token);
            }
          }
        });

        if (deadTokens.length > 0) {
          await this.pruneDeadTokens(deadTokens);
        }

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

  private async pruneDeadTokens(deadTokens: string[]): Promise<void> {
    if (!this.userRepository || deadTokens.length === 0) {
      return;
    }
    const deadSet = new Set(deadTokens);
    try {
      if (typeof this.userRepository.find === 'function') {
        const users = await this.userRepository.find();
        for (const user of users || []) {
          const existing = Array.isArray(user.fcmTokens) ? user.fcmTokens : [];
          const filtered = existing.filter((t) => !deadSet.has(t));
          const primaryDead = Boolean(
            user.fcmToken && deadSet.has(user.fcmToken),
          );
          if (filtered.length !== existing.length || primaryDead) {
            user.fcmTokens = filtered;
            if (primaryDead) {
              user.fcmToken = filtered[0] ?? null;
            }
            const updatePayload: Partial<User> = { fcmTokens: filtered };
            if (primaryDead) {
              updatePayload.fcmToken = user.fcmToken;
            }
            if (typeof this.userRepository.update === 'function') {
              await this.userRepository.update(user.id, updatePayload);
            }
            if (typeof this.userRepository.save === 'function') {
              await this.userRepository.save(user);
            }
          }
        }
      }
    } catch (err) {
      this.logger.warn(
        `Failed to prune dead FCM tokens: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
