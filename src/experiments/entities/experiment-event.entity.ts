import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Experiment } from './experiment.entity';
import { ExperimentAssignment } from './experiment-assignment.entity';

@Entity('experiment_events')
@Index(['experimentId', 'eventName'])
@Index(['assignmentId'])
export class ExperimentEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  experimentId: string;

  @ManyToOne(() => Experiment, (experiment) => experiment.events, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'experimentId' })
  experiment: Experiment;

  @Column({ type: 'uuid' })
  assignmentId: string;

  @ManyToOne(() => ExperimentAssignment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignmentId' })
  assignment: ExperimentAssignment;

  @Column({ type: 'varchar', length: 255 })
  eventName: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  occurredAt: Date;
}
