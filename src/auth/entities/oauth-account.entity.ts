import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../users/user.entity';

export enum OAuthProvider {
  GOOGLE = 'GOOGLE',
  GITHUB = 'GITHUB',
}

@Entity('oauth_accounts')
@Unique(['provider', 'providerAccountId'])
export class OAuthAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: OAuthProvider })
  provider: OAuthProvider;

  @Column({ type: 'varchar', length: 255 })
  providerAccountId: string;

  @Column({ type: 'text', nullable: true })
  accessToken: string | null;

  @Column({ type: 'text', nullable: true })
  refreshToken: string | null;

  @Column({ type: 'jsonb', nullable: true })
  profile: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
