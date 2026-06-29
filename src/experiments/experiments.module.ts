import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Experiment } from './entities/experiment.entity';
import { ExperimentVariant } from './entities/experiment-variant.entity';
import { ExperimentAssignment } from './entities/experiment-assignment.entity';
import { ExperimentEvent } from './entities/experiment-event.entity';
import { ExperimentsService } from './experiments.service';
import { ExperimentsController } from './experiments.controller';
import { AdminExperimentsController } from './admin-experiments.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Experiment,
      ExperimentVariant,
      ExperimentAssignment,
      ExperimentEvent,
    ]),
  ],
  controllers: [ExperimentsController, AdminExperimentsController],
  providers: [ExperimentsService],
  exports: [ExperimentsService, TypeOrmModule],
})
export class ExperimentsModule {}
