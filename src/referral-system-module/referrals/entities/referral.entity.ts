// `src/referrals/entities/referral.entity.ts`
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('referrals')
export class Referral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'referrer_user_id' })
  referrerUserId: string;

  @Column({ name: 'referred_user_id', nullable: true })
  referredUserId: string;

  @Column()
  @Index({ unique: true })
  code: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'used_at', nullable: true })
  usedAt: Date;

  @Column({ default: true })
  active: boolean;
}