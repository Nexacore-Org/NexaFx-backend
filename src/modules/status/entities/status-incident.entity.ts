import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum IncidentSeverity { MINOR = 'MINOR', MAJOR = 'MAJOR', CRITICAL = 'CRITICAL' }
export enum IncidentStatus { INVESTIGATING = 'INVESTIGATING', IDENTIFIED = 'IDENTIFIED', MONITORING = 'MONITORING', RESOLVED = 'RESOLVED' }

@Entity('status_incidents')
export class StatusIncident {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ type: 'varchar', length: 200 })
  title: string;
  @Column({ type: 'text' })
  body: string;
  @Column({ type: 'enum', enum: IncidentSeverity })
  severity: IncidentSeverity;
  @Column({ type: 'enum', enum: IncidentStatus, default: IncidentStatus.INVESTIGATING })
  status: IncidentStatus;
  @Column({ type: 'simple-array', nullable: true })
  affectedComponents: string[];
  @Column({ type: 'timestamp with time zone' })
  startedAt: Date;
  @Column({ type: 'timestamp with time zone', nullable: true })
  resolvedAt: Date | null;
  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
