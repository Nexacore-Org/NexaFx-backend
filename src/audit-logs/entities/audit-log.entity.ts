import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';
import { AuditEntityType } from '../enums/audit-entity-type.enum';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  userId: string | null;

  @Column()
  @Index()
  action: string;

  @Column({
    type: 'enum',
    enum: AuditEntityType,
  })
  @Index()
  entity: AuditEntityType;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  entityId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: 'inet', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @CreateDateColumn()
  @Index()
  createdAt: Date;

  @Column({ default: false })
  @Index()
  isSensitive: boolean;
}
