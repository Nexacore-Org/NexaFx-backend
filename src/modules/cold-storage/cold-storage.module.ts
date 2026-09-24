import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ColdStorageAccount } from './entities/cold-storage-account.entity';
import { ColdStorageWithdrawal } from './entities/cold-storage-withdrawal.entity';
import { ColdStorageService } from './cold-storage.service';
import { ColdStorageController, ColdStorageAdminController } from './cold-storage.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { WalletsModule } from '../wallets/wallets.module';
import { UsersModule } from '../users/users.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ColdStorageAccount, ColdStorageWithdrawal]),
    BlockchainModule,
    WalletsModule,
    UsersModule,
    AuditLogsModule,
  ],
  controllers: [ColdStorageController, ColdStorageAdminController],
  providers: [ColdStorageService],
  exports: [ColdStorageService],
})
export class ColdStorageModule {}
