import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { AuditLogStatus } from '../enums/audit-log-status.enum';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  actorId: string | null;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  targetId: string | null;

  @Column()
  @Index()
  action: string;

  @Column()
  @Index()
  resourceType: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  resourceId: string | null;

  @Column({ type: 'varchar', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({
    type: 'enum',
    enum: AuditLogStatus,
  })
  @Index()
  status: AuditLogStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  @Index()
  createdAt: Date;

  @Column({ default: false })
  @Index()
  isSensitive: boolean;

  // Compatibility virtual fields (not mapped to DB columns)
  get userId(): string | null {
    return this.actorId;
  }
  set userId(value: string | null) {
    this.actorId = value;
  }

  get entity(): any {
    return this.resourceType;
  }
  set entity(value: any) {
    this.resourceType = value;
  }

  get entityId(): string | null {
    return this.resourceId;
  }
  set entityId(value: string | null) {
    this.resourceId = value;
  }
}
