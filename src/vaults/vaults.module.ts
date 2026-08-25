import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavingsVault } from './entities/savings-vault.entity';
import { VaultTransaction } from './entities/vault-transaction.entity';
import { VaultsService } from './vaults.service';
import { VaultsController } from './vaults.controller';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SavingsVault, VaultTransaction]),
    UsersModule,
    NotificationsModule,
  ],
  controllers: [VaultsController],
  providers: [VaultsService],
  exports: [VaultsService],
})
export class VaultsModule {}
