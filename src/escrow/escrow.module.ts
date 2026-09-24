import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Escrow } from './entities/escrow.entity';
import { EscrowService } from './escrow.service';
import { EscrowController, EscrowAdminController } from './escrow.controller';
import { UsersModule } from '../users/users.module';
import { WalletsModule } from '../wallets/wallets.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Escrow]),
    UsersModule,
    WalletsModule,
    BlockchainModule,
    NotificationsModule,
    CommonModule,
  ],
  providers: [EscrowService],
  controllers: [EscrowController, EscrowAdminController],
  exports: [EscrowService],
})
export class EscrowModule {}
