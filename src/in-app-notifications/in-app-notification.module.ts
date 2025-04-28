import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InAppNotification } from './in-app-notification.entity';
import { InAppNotificationService } from './in-app-notification.service';
import { EmailService } from './email.service';
import { InAppNotificationController } from './in-app-notification.controller';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    TypeOrmModule.forFeature([InAppNotification]),
    EventEmitterModule.forRoot(),
  ],
  controllers: [InAppNotificationController],
  providers: [InAppNotificationService, EmailService],
  exports: [InAppNotificationService, EmailService],
})
export class NotificationModule {}
