import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletConnectSession } from './entities/walletconnect-session.entity';
import { WalletConnectService } from './walletconnect.service';
import { WalletConnectController } from './walletconnect.controller';
import { BlockchainModule } from '../../blockchain/blockchain.module';
import { UsersModule } from '../../users/users.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WalletConnectSession]),
    BlockchainModule,
    UsersModule,
    RedisModule,
  ],
  controllers: [WalletConnectController],
  providers: [WalletConnectService],
  exports: [WalletConnectService],
})
export class WalletConnectModule {}
