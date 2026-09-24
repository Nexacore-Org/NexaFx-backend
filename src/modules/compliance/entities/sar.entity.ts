import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
} from 'typeorm';
import { ComplianceFlag } from './compliance-flag.entity';
import { User } from '../../../users/user.entity';

@Index(['flagId'])
@Index(['filedById'])
@Entity('sars')
export class Sar {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ComplianceFlag, (flag) => flag.id, { onDelete: 'CASCADE' })
  flag: ComplianceFlag;

  @Column({ type: 'uuid' })
  flagId: string;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'SET NULL' })
  filedBy: User;

  @Column({ type: 'uuid' })
  filedById: string;

  @Column({ type: 'text' })
  narrative: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  filedAt: Date;

  @Column()
  reportReference: string;
}
