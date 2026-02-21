import { User } from 'src/users/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum BeneficiaryNetwork {
  STELLAR = 'stellar',
  OTHER = 'other',
}

@Entity('beneficiaries')
export class Beneficiary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 100 })
  nickname: string;

  @Column({ name: 'wallet_address', length: 100 })
  walletAddress: string;

  @Column({ length: 10 })
  currency: string;

  @Column({
    type: 'enum',
    enum: BeneficiaryNetwork,
    default: BeneficiaryNetwork.STELLAR,
  })
  network: BeneficiaryNetwork;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
