import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrainingModule } from './entities/training-module.entity';
import { StaffTrainingRecord } from './entities/staff-training-record.entity';
import { TrainingService } from './training.service';
import { TrainingController } from './training.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TrainingModule, StaffTrainingRecord])],
  controllers: [TrainingController],
  providers: [TrainingService],
  exports: [TrainingService],
})
export class StaffTrainingModule {}
