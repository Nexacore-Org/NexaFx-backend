import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { DB_COLUMN_TYPES } from '../common/database/column-types';

export enum OtpType {
  LOGIN = 'LOGIN',
  PASSWORD_RESET = 'PASSWORD_RESET',
  SIGNUP = 'SIGNUP',
}

@Entity('otps')
@Index(['userId', 'type'])
@Index(['userId', 'usedAt'])
export class Otp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 255 })
  codeHash: string;

  @Column({
    type: DB_COLUMN_TYPES.enum,
    enum: OtpType,
  })
  type: OtpType;

  @Column({ type: DB_COLUMN_TYPES.timestamp })
  expiresAt: Date;

  @Column({ type: DB_COLUMN_TYPES.timestamp, nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: DB_COLUMN_TYPES.timestamp })
  createdAt: Date;
}
