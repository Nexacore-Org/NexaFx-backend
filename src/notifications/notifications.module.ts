import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsController } from './notifications.controller';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { NotificationPreferenceController } from './controllers/notification-preference.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, NotificationPreference])],
  controllers: [NotificationsController, NotificationPreferenceController],
  providers: [NotificationsService, NotificationPreferenceService],
  exports: [NotificationsService, NotificationPreferenceService],
})
export class NotificationsModule {}
