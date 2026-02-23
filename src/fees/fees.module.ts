import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeesController } from './fees.controller';
import { FeesService } from './fees.service';
import { FeeConfig } from './entities/fee-config.entity';
import { FeeRecord } from './entities/fee-record.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FeeConfig, FeeRecord])],
  controllers: [FeesController],
  providers: [FeesService],
  exports: [FeesService],
})
export class FeesModule {}
