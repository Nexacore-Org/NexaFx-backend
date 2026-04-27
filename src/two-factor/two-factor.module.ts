import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TwoFactorService } from './two-factor.service';
import { TwoFactorController } from './two-factor.controller';
import { UsersModule } from '../users/users.module';
import { BackupCode } from './entities/backup-code.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([BackupCode]),
    forwardRef(() => AuthModule),
  ],
  providers: [TwoFactorService],
  controllers: [TwoFactorController],
  exports: [TwoFactorService],
})
export class TwoFactorModule {}
