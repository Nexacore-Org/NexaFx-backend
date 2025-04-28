import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { Notification } from "./notification.entity"
import { NotificationService } from "./notification.service"
import { EmailService } from "./email.service"
import { NotificationController } from "./notification.controller"
import { EventEmitterModule } from "@nestjs/event-emitter"

@Module({
  imports: [TypeOrmModule.forFeature([Notification]), EventEmitterModule.forRoot()],
  controllers: [NotificationController],
  providers: [NotificationService, EmailService],
  exports: [NotificationService, EmailService],
})
export class NotificationModule {}
