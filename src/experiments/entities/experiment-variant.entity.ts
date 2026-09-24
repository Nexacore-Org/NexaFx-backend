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

@Entity('experiment_variants')
@Index(['experimentId', 'key'], { unique: true })
export class ExperimentVariant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  experimentId: string;

  @ManyToOne(() => Experiment, (experiment) => experiment.variants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'experimentId' })
  experiment: Experiment;

  @Column({ type: 'varchar', length: 255 })
  key: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'int', default: 50 })
  weight: number;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  config: Record<string, any>;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
