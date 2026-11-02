import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { StringValue } from 'ms';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsController } from './notifications.controller';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationPreferenceService } from './services/notification-preference.service';
import { NotificationPreferenceController } from './controllers/notification-preference.controller';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../modules/mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationPreference, User]),
    MailModule,
    forwardRef(() => UsersModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        const isProduction =
          configService.get<string>('NODE_ENV') === 'production';

        if (!secret && isProduction) {
          throw new Error('JWT_SECRET must be set in production environment');
        }

        const expiresIn = (configService.get<string>('JWT_EXPIRES_IN') ??
          '15m') as StringValue;

        return {
          secret: secret ?? 'default-secret-change-in-production',
          signOptions: { expiresIn },
        };
      },
    }),
  ],
  controllers: [NotificationsController, NotificationPreferenceController],
  providers: [
    NotificationsService,
    NotificationPreferenceService,
    NotificationsGateway,
  ],
  exports: [NotificationsService, NotificationPreferenceService],
})
export class NotificationsModule {}
