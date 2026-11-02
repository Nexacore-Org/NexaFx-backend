import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { getApps } from 'firebase-admin/app';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';

const PRUNABLE_FCM_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'registration-token-not-registered',
  'messaging/invalid-registration-token',
  'invalid-registration-token',
  'messaging/invalid-argument',
  'invalid-argument',
]);

export function isPrunableFcmErrorCode(code?: string): boolean {
  if (!code) {
    return false;
  }
  return PRUNABLE_FCM_ERROR_CODES.has(code);
}

export function maskFcmToken(token: string): string {
  if (!token || typeof token !== 'string') {
    return '***';
  }
  if (token.length <= 2) {
    return '***';
  }
  if (token.length <= 8) {
    return `${token.slice(0, 2)}***`;
  }
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export function stringifyFcmData(
  data?: Record<string, any>,
): Record<string, string> {
  const stringifiedData: Record<string, string> = {};
  if (!data) {
    return stringifiedData;
  }
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) {
      continue;
    }
    if (typeof value === 'string') {
      stringifiedData[key] = value;
    } else {
      const serialized = JSON.stringify(value);
      if (serialized !== undefined) {
        stringifiedData[key] = serialized;
      }
    }
  }
  return stringifiedData;
}

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
        this.logger.warn(
          `User ${userId} not found, skipping push notification.`,
        );
        return;
      }

      const rawTokens = [
        ...(Array.isArray(user.fcmTokens) ? user.fcmTokens : []),
        ...(user.fcmToken ? [user.fcmToken] : []),
      ].filter((t): t is string => typeof t === 'string' && t.trim().length > 0);

      const tokens = Array.from(new Set(rawTokens));

      if (tokens.length === 0) {
        this.logger.warn(`User ${userId} has no FCM token registered.`);
        return;
      }

      if (getApps().length === 0) {
        this.logger.warn(
          'Firebase Admin SDK is not initialized. Skipping push notification.',
        );
        return;
      }

      const stringifiedData = stringifyFcmData(data);

      const message: MulticastMessage = {
        tokens,
        notification: {
          title,
          body,
        },
        data: stringifiedData,
      };

      const messaging = getMessaging() as any;
      const response =
        typeof messaging.sendEachForMulticast === 'function'
          ? await messaging.sendEachForMulticast(message)
          : await Promise.all(
              tokens.map(async (token) => {
                try {
                  await messaging.send({
                    token,
                    notification: { title, body },
                    data: stringifiedData,
                  });
                  return { success: true };
                } catch (error) {
                  return { success: false, error };
                }
              }),
            ).then((responses) => ({
              successCount: responses.filter((r) => r.success).length,
              failureCount: responses.filter((r) => !r.success).length,
              responses,
            }));

      const deadTokens = new Set<string>();
      if (response?.responses) {
        response.responses.forEach((resp: any, idx: number) => {
          if (!resp.success) {
            const token = tokens[idx];
            const errorCode = resp.error?.code;
            this.logger.warn(
              `Failed to send push notification to token ${maskFcmToken(token)} (${errorCode ?? 'unknown'}): ${resp.error?.message ?? 'unknown error'}`,
            );
            if (isPrunableFcmErrorCode(errorCode)) {
              deadTokens.add(token);
            }
          }
        });
      }

      if (deadTokens.size > 0) {
        const currentList = Array.isArray(user.fcmTokens) ? user.fcmTokens : [];
        const remainingTokens = currentList.filter((t) => !deadTokens.has(t));
        const primaryRemoved = Boolean(
          user.fcmToken && deadTokens.has(user.fcmToken),
        );
        user.fcmTokens = remainingTokens;
        if (primaryRemoved) {
          user.fcmToken = remainingTokens[0] ?? null;
        }

        const updatePayload: Partial<User> = { fcmTokens: remainingTokens };
        if (primaryRemoved) {
          updatePayload.fcmToken = user.fcmToken;
        }

        if (typeof this.userRepository.update === 'function') {
          await this.userRepository.update(userId, updatePayload);
        }
        if (typeof this.userRepository.save === 'function') {
          await this.userRepository.save(user);
        }
      }

      this.logger.log(
        `Push notification processed for user ${userId}: ${response?.successCount ?? tokens.length} sent, ${response?.failureCount ?? 0} failed.`,
      );
    } catch (error) {
      // Constraint: "Push delivery failure must not throw — log error and continue"
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send push notification to user ${userId}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
