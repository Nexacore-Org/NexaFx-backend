import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum ReportEntityTarget {
  TRANSACTIONS = 'TRANSACTIONS',
  USERS = 'USERS',
  KYC = 'KYC',
}

@Entity('custom_report_definitions')
export class CustomReportDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  createdBy: string;

  @Column({
    type: 'enum',
    enum: ReportEntityTarget,
  })
  entity: ReportEntityTarget;

  @Column({ type: 'jsonb', default: {} })
  filters: Record<string, any>;

  @Column('text', { array: true })
  columns: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}