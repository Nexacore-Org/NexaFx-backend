import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SpendingGoal } from './entities/spending-goal.entity';
import { SpendingGoalsService } from './spending-goals.service';
import { SpendingGoalsController } from './spending-goals.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SpendingGoal]),
    NotificationsModule,
  ],
  controllers: [SpendingGoalsController],
  providers: [SpendingGoalsService],
  exports: [SpendingGoalsService],
})
export class SpendingGoalsModule {}
