import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { NotificationPreferenceController } from './controllers/notification-preference.controller';
import { NotificationPersistenceService } from './services/notification-persistence.service';
import {
  NotificationGateway,
  NotificationWsGuard,
} from './gateways/notification.gateway';
import { UserNotificationController } from './controllers/user-notification.controller';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationPreference]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    NotificationsController,
    NotificationPreferenceController,
    UserNotificationController,
  ],
  providers: [
    NotificationsService,
    NotificationPreferenceService,
    NotificationPersistenceService,
    NotificationGateway,
    NotificationWsGuard,
  ],
  exports: [
    NotificationsService,
    NotificationPreferenceService,
    NotificationPersistenceService,
    NotificationGateway,
  ],
})
export class NotificationsModule {}
