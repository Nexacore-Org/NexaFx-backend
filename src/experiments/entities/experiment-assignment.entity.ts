import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Experiment } from './experiment.entity';
import { ExperimentVariant } from './experiment-variant.entity';

@Entity('experiment_assignments')
@Unique(['experimentId', 'userId'])
@Index(['experimentId'])
@Index(['userId'])
export class ExperimentAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  experimentId: string;

  @ManyToOne(() => Experiment, (experiment) => experiment.assignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'experimentId' })
  experiment: Experiment;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  variantId: string;

  @ManyToOne(() => ExperimentVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variantId' })
  variant: ExperimentVariant;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  assignedAt: Date;
}
