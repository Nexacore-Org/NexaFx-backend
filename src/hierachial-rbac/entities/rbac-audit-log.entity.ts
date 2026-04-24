import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('rbac_audit_logs')
@Index(['action', 'timestamp'])
export class RbacAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  action: string; // ROLE_CREATED, ROLE_UPDATED, ROLE_DELETED, PERMISSION_GRANTED, etc.

  @Column('uuid', { nullable: true })
  roleId: string | null;

  @Column('uuid')
  actorId: string; // Admin who performed the action

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>; // Changes made, old values, new values

  @CreateDateColumn()
  timestamp: Date;
}
