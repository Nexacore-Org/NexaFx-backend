import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('blockchain_wallets')
export class BlockchainWallet {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    publicKey: string;

    @Column({ type: 'text' })
    encryptedSecret: string;

    @Column({ nullable: true })
    label: string;

    @Column({ type: 'uuid' })
    userId: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column({ default: true })
    isActive: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}