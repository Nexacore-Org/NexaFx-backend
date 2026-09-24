import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Message } from './entities/message.entity';
import { Broadcast } from './entities/broadcast.entity';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { BroadcastProcessor } from './processors/broadcast.processor';
import { MessagingGateway } from '../gateways/messaging.gateway';
import { WsJwtGuard } from '../gateways/ws-jwt.guard';
import { User } from '../users/user.entity';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, Broadcast, User]),
    BullModule.registerQueue({ name: 'broadcast' }),
    AuthModule,
    CommonModule,
  ],
  controllers: [MessagingController],
  providers: [MessagingService, BroadcastProcessor, MessagingGateway, WsJwtGuard],
  exports: [MessagingService],
})
export class MessagingModule {}
