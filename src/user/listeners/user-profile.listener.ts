import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from 'src/notifications/providers/notifications.service';
import { NotificationType } from 'src/notifications/enum/notificationType.enum';
import { NotificationChannel } from 'src/notifications/enum/notificationChannel.enum';

@Injectable()
export class UserProfileListener {
  constructor(private readonly notificationsService: NotificationsService) {}

  @OnEvent('profile.updated')
  async handleProfileUpdated(payload: { userId: string }) {
    await this.notificationsService.create({
      userId: payload.userId,
      title: 'Profile Complete!',
      message:
        'Your profile is now complete. You can initiate verification to unlock all features.',
      type: NotificationType.SYSTEM,
      channel: NotificationChannel.BOTH,
    } as any);
  }

  @OnEvent('verification.initiated')
  async handleVerificationInitiated(payload: { userId: string }) {
    await this.notificationsService.create({
      userId: payload.userId,
      title: 'Verification Submitted',
      message: 'Your verification request has been submitted and is under review.',
      type: NotificationType.SYSTEM,
      channel: NotificationChannel.BOTH,
    } as any);
  }

  @OnEvent('phone.verified')
  async handlePhoneVerified(payload: { userId: string }) {
    await this.notificationsService.create({
      userId: payload.userId,
      title: 'Phone Verified',
      message: 'Your phone number has been successfully verified.',
      type: NotificationType.SYSTEM,
      channel: NotificationChannel.BOTH,
    } as any);
  }
}


