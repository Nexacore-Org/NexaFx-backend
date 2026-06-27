import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { User } from '../../users/user.entity';
import { OrganisationMember } from './organisation-member.entity';

@Entity('organisations')
export class Organisation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  name: string;

  @Column({ nullable: true })
  description: string | null;

  @Column()
  walletPublicKey: string;

  @Column({ type: 'text' })
  @Exclude({ toPlainOnly: true })
  walletSecretKeyEncrypted: string;

  @Column({ type: 'jsonb', default: {} })
  balances: Record<string, number>;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 10000 })
  txLimitPerDay: number;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: 1000 })
  txLimitPerTx: number;

  @Column()
  ownerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @OneToMany(() => OrganisationMember, (m) => m.organisation)
  members: OrganisationMember[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
