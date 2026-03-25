import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { AuditEntityType } from '../enums/audit-entity-type.enum';
import { DB_COLUMN_TYPES } from '../../common/database/column-types';

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
    type: DB_COLUMN_TYPES.enum,
    enum: AuditEntityType,
  })
  @Index()
  entity: AuditEntityType;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  entityId: string | null;

  @Column({ type: DB_COLUMN_TYPES.json, nullable: true })
  metadata: Record<string, any> | null;

  @Column({ type: DB_COLUMN_TYPES.inet, nullable: true })
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
