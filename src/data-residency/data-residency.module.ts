// src/data-residency/data-residency.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DataResidencyController } from './data-residency.controller';
import { DataResidencyService } from './data-residency.service';
import { DataResidencyPolicy } from './entities/data-residency-policy.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([DataResidencyPolicy]),
    ConfigModule,
  ],
  controllers: [DataResidencyController],
  providers: [DataResidencyService],
  exports: [DataResidencyService],
})
export class DataResidencyModule {}