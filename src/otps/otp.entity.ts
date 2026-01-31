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
    type: 'enum',
    enum: OtpType,
  })
  type: OtpType;

  @Column({ type: 'timestamp with time zone' })
  expiresAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
