

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminStatsController } from 'src/modules/admin/controllers/admin.stats.controller';
import { AdminStatsService } from 'src/modules/admin/services/admin.stats.service';
import { Transaction } from '../transactions/entities/transaction.entity';
import { User } from 'src/user/entities/user.entity';
import { Currency } from '../currencies/entities/currency.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, User, Currency]),
    AuthModule, // Import AuthModule to use JwtAuthGuard and RolesGuard
  ],
  controllers: [AdminStatsController],
  providers: [AdminStatsService],
})
export class AdminModule {}