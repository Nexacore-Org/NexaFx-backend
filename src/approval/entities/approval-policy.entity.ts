import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('approval_policies')
export class ApprovalPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  organisationId: string;

  @Column()
  name: string;

  @Column({ type: 'jsonb' })
  conditions: {
    thresholdAmount: number; // e.g., trigger policy if transaction amount > 5000 XLM
    currency: string;
  };

  @Column({ default: 1 })
  requiredApprovals: number;

  @Column({ type: 'uuid', array: true })
  approvers: string[]; // Set of authorized User UUIDs allowed to sign off

  @Column({ default: 24 })
  timeoutHours: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}