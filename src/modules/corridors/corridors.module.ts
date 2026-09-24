import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentCorridor } from './entities/payment-corridor.entity';
import { CorridorsService } from './corridors.service';
import { CorridorsPublicController, CorridorsAdminController } from './corridors.controller';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentCorridor]),
    RedisModule,
  ],
  controllers: [CorridorsPublicController, CorridorsAdminController],
  providers: [CorridorsService],
  exports: [CorridorsService],
})
export class CorridorsModule {}
