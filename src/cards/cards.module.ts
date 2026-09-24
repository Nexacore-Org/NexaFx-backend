import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CardsService } from './cards.service';
import { CardsController } from './cards.controller';
import { VirtualCard } from './entities/virtual-card.entity';
import { User } from '../users/user.entity';
import { KycRecord } from '../kyc/entities/kyc.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VirtualCard, User, KycRecord, Transaction]),
    UsersModule,
  ],
  controllers: [CardsController],
  providers: [CardsService],
})
export class CardsModule {}
