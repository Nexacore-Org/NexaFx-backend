import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  constructor(private readonly configService: ConfigService) {}
  async sendPushNotification(tokens: string[], title: string, body: string, data?: any): Promise<any> {
    return { successCount: 0, failureCount: tokens.length };
  }
  async sendToTokens(tokens: string[], title: string, body: string, data?: any): Promise<any> {
    return { successCount: 0, failureCount: tokens.length };
  }
}
