import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueuesModule } from '../queues/queues.module';
import { MailProcessor } from './mail.processor';
import { MailService } from './mail.service';

@Module({
  imports: [ConfigModule, QueuesModule],
  providers: [MailService, MailProcessor],
  exports: [MailService],
})
export class MailModule {}
