import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { TrainingModule } from './training-module.entity';

export enum TrainingStatus { ASSIGNED = 'ASSIGNED', IN_PROGRESS = 'IN_PROGRESS', COMPLETED = 'COMPLETED', EXPIRED = 'EXPIRED' }

@Entity('staff_training_records')
export class StaffTrainingRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ type: 'uuid' })
  userId: string;
  @Column({ type: 'uuid' })
  moduleId: string;
  @ManyToOne(() => TrainingModule)
  @JoinColumn({ name: 'moduleId' })
  module: TrainingModule;
  @Column({ type: 'enum', enum: TrainingStatus, default: TrainingStatus.ASSIGNED })
  status: TrainingStatus;
  @Column({ type: 'timestamp with time zone' })
  assignedAt: Date;
  @Column({ type: 'timestamp with time zone', nullable: true })
  completedAt: Date | null;
  @Column({ type: 'timestamp with time zone', nullable: true })
  expiresAt: Date | null;
  @Column({ type: 'int', nullable: true })
  score: number | null;
  @Column({ type: 'int', default: 0 })
  attempts: number;
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
