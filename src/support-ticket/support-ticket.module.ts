import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicket } from './entities/support-ticket.entity';
import { AuthModule } from '../auth/auth.module';
import { SupportTicketsController } from './support-ticket.controller';
import { SupportTicketsService } from './support-ticket.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportTicket]),
    AuthModule,
  ],
  controllers: [SupportTicketsController],
  providers: [SupportTicketsService],
  exports: [SupportTicketsService],
})
export class SupportTicketsModule {}
