/* eslint-disable prettier/prettier */
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm"
import { TransactionType } from "../enums/transaction-type.enum"
import { TransactionStatus } from "../enums/transaction-status.enum"
import { Currency } from "src/currencies/entities/currency.entity"
import { User } from "src/user/entities/user.entity"

@Entity("transactions")
export class Transaction {
  @PrimaryGeneratedColumn("uuid")
  id: string

  // User who initiates the transaction
  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: "initiatorId" })
  initiator: User

  @Column({ type: "uuid" })
  initiatorId: string

  // Optional receiver for peer-to-peer transactions
  @ManyToOne(() => User, { eager: true, nullable: true })
  @JoinColumn({ name: "receiverId" })
  receiver?: User

  @Column({ type: "uuid", nullable: true })
  receiverId?: string

  @Column()
  asset: string

  @Column({ type: "enum", enum: TransactionType })
  @Index()
  type: TransactionType

  @Column({ type: "decimal", precision: 12, scale: 2 })
  amount: number

  @ManyToOne(() => Currency)
  @JoinColumn({ name: "currencyId" })
  currency: Currency

  @Column({ type: "uuid" })
  currencyId: string

  @Column({
    type: "enum",
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  @Index()
  status: TransactionStatus

  @Column({ nullable: true })
  txHash: string

  @Column({ nullable: true })
  reason: string

  @Column({ unique: true })
  reference: string

  @Column({ nullable: true })
  description?: string

  @Column({ type: "json", nullable: true })
  metadata?: Record<string, any>

  @Column({ nullable: true })
  sourceAccount?: string

  @Column({ nullable: true })
  destinationAccount?: string

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  totalAmount?: number

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  feeAmount?: number

  @ManyToOne(() => Currency, { nullable: true })
  @JoinColumn({ name: "feeCurrencyId" })
  feeCurrency?: Currency

  @Column({ type: "uuid", nullable: true })
  feeCurrencyId?: string

  @Column({ type: "timestamp", nullable: true })
  processingDate?: Date

  @Column({ type: "timestamp", nullable: true })
  completionDate?: Date

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
