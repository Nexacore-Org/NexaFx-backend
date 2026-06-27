import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Unique, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum OAuthProvider {
  GOOGLE = 'google',
  GITHUB = 'github',
}

@Entity({ name: 'oauth_accounts' })
@Unique(['provider', 'providerAccountId'])
export class OAuthAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: OAuthProvider })
  provider: OAuthProvider;

  @Column({ name: 'provider_account_id' })
  providerAccountId: string;

  // Encrypted tokens
  @Column({ name: 'access_token', type: 'text', nullable: true })
  accessToken?: string;

  @Column({ name: 'refresh_token', type: 'text', nullable: true })
  refreshToken?: string;

  @Column({ type: 'jsonb', nullable: true })
  profile: Record<string, any>;

  @ManyToOne(() => User, (user) => user.oauthAccounts, { onDelete: 'CASCADE' })
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
