import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('training_modules')
export class TrainingModule {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ type: 'varchar', length: 200 })
  title: string;
  @Column({ type: 'text' })
  description: string;
  @Column({ type: 'int' })
  durationMinutes: number;
  @Column({ type: 'boolean', default: false })
  isRequired: boolean;
  @Column({ type: 'int', default: 12 })
  validityMonths: number;
  @Column({ type: 'simple-array', nullable: true })
  targetRoles: string[];
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
