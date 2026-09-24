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
import { Organisation } from './organisation.entity';

export enum OrgRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum InviteStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
}

@Entity('organisation_members')
@Index(['organisationId', 'userId'], { unique: true, where: '"userId" IS NOT NULL' })
@Index(['inviteToken'], { where: '"inviteToken" IS NOT NULL' })
export class OrganisationMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  organisationId: string;

  @ManyToOne(() => Organisation, (o) => o.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organisationId' })
  organisation: Organisation;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column()
  inviteEmail: string;

  @Column({ type: 'enum', enum: OrgRole, default: OrgRole.MEMBER })
  role: OrgRole;

  @Column({ type: 'enum', enum: InviteStatus, default: InviteStatus.PENDING })
  inviteStatus: InviteStatus;

  @Column({ type: 'uuid', nullable: true })
  inviteToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  inviteTokenExpiresAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  joinedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
