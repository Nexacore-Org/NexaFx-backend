import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, JoinColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';

export enum KycStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

export enum IdType {
  BVN = 'bvn',
  NIN = 'nin',
  PASSPORT = 'passport'
}

@Entity('kyc_verifications')
export class KycVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fullName: string;

  @Column({
    type: 'enum',
    enum: IdType
  })
  idType: IdType;

  @Column()
  idNumber: string;

  @Column()
  selfieUrl: string;

  @Column({
    type: 'enum',
    enum: KycStatus,
    default: KycStatus.PENDING
  })
  status: KycStatus;

  @Column({ nullable: true })
  rejectionReason?: string;

  @Column()
  userId: string;

  @OneToOne(() => User)
  @JoinColumn()
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
} 