

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { User } from 'src/user/entities/user.entity';
import { Currency } from '../currencies/entities/currency.entity';
import { AuthModule } from '../auth/auth.module';
import { AdminStatsController } from './admin.stats.controller';
import { AdminStatsService } from './admin.stats.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, User, Currency]),
    AuthModule, // Import AuthModule to use JwtAuthGuard and RolesGuard
  ],
  controllers: [AdminStatsController],
  providers: [AdminStatsService],
})
export class AdminModule {}