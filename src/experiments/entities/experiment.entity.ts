import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { ExperimentVariant } from './experiment-variant.entity';
import { ExperimentAssignment } from './experiment-assignment.entity';
import { ExperimentEvent } from './experiment-event.entity';

export enum ExperimentStatus {
  DRAFT = 'DRAFT',
  RUNNING = 'RUNNING',
  PAUSED = 'PAUSED',
  CONCLUDED = 'CONCLUDED',
}

@Entity('experiments')
export class Experiment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  @Index()
  key: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: ExperimentStatus,
    default: ExperimentStatus.DRAFT,
  })
  status: ExperimentStatus;

  @Column({ type: 'int', default: 100 })
  trafficPercent: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  startAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  endAt: Date;

  @OneToMany(() => ExperimentVariant, (variant) => variant.experiment, {
    cascade: true,
  })
  variants: ExperimentVariant[];

  @OneToMany(() => ExperimentAssignment, (assignment) => assignment.experiment)
  assignments: ExperimentAssignment[];

  @OneToMany(() => ExperimentEvent, (event) => event.experiment)
  events: ExperimentEvent[];

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
