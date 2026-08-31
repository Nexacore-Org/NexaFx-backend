import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SandboxAccount } from './entities/sandbox-account.entity';
import { SandboxEvent } from './entities/sandbox-event.entity';
import { SandboxRequestLog } from './entities/sandbox-request-log.entity';
import { SandboxService } from './sandbox.service';
import { SandboxController } from './sandbox.controller';
import { UsersModule } from '../../users/users.module';
import { WalletsModule } from '../../wallets/wallets.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SandboxAccount, SandboxEvent, SandboxRequestLog]),
    UsersModule,
    WalletsModule,
    RedisModule,
  ],
  controllers: [SandboxController],
  providers: [SandboxService],
  exports: [SandboxService],
})
export class SandboxModule {}
