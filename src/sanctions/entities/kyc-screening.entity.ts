import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/user.entity';

export enum ScreeningStatus {
  CLEAR = 'CLEAR',
  WARNING = 'WARNING',
  BLOCKED = 'BLOCKED',
}

export enum ScreeningProvider {
  OPEN_SANCTIONS = 'OPEN_SANCTIONS',
  OFAC = 'OFAC',
}

@Entity('kyc_screenings')
@Index(['userId', 'createdAt'])
export class KycScreening {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  fullName: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date | null;

  @Column({ nullable: true })
  nationality: string | null;

  @Column({ type: 'int', default: 0 })
  score: number;

  @Column({ type: 'enum', enum: ScreeningStatus, default: ScreeningStatus.CLEAR })
  status: ScreeningStatus;

  @Column({ type: 'enum', enum: ScreeningProvider })
  provider: ScreeningProvider;

  @Column({ type: 'jsonb', default: [] })
  matches: object[];

  @Column({ type: 'uuid', nullable: true })
  overriddenBy: string | null;

  @Column({ nullable: true })
  overrideReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  overriddenAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
