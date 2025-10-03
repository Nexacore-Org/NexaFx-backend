import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from 'typeorm';

export enum TransactionStatus {
    PENDING = 'PENDING',
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
    PROCESSING = 'PROCESSING',
}

export enum TransactionType {
    TRANSFER = 'TRANSFER',
    CONTRACT_CALL = 'CONTRACT_CALL',
    DEPLOY = 'DEPLOY',
    CREATE_WALLET = 'CREATE_WALLET',
}

@Entity('contract_transactions')
@Index(['txHash'])
@Index(['status'])
@Index(['userId'])
export class ContractTransaction {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    txHash: string;

    @Column({
        type: 'enum',
        enum: TransactionType,
    })
    type: TransactionType;

    @Column({
        type: 'enum',
        enum: TransactionStatus,
        default: TransactionStatus.PENDING,
    })
    status: TransactionStatus;

    @Column({ nullable: true })
    userId?: string;

    @Column({ nullable: true })
    fromAddress?: string;

    @Column({ nullable: true })
    toAddress?: string;

    @Column({ type: 'decimal', precision: 20, scale: 7, nullable: true })
    amount?: number;

    @Column({ nullable: true })
    assetCode?: string;

    @Column({ type: 'text', nullable: true })
    memo?: string;

    @Column({ type: 'jsonb', nullable: true })
    metadata?: Record<string, any>;

    @Column({ type: 'text', nullable: true })
    errorMessage?: string; // Changed to optional

    @Column({ type: 'int', default: 0 })
    retryCount: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @Column({ nullable: true })
    confirmedAt?: Date;
}