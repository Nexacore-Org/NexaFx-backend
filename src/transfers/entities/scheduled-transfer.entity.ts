import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm"
import { User } from "../../user/entities/user.entity"
import { Currency } from "../../currencies/entities/currency.entity"

export enum ScheduledTransferStatus {
  PENDING = "pending",
  EXECUTED = "executed",
  CANCELLED = "cancelled",
  FAILED = "failed",
}

@Entity("scheduled_transfers")
export class ScheduledTransfer {
  @PrimaryGeneratedColumn("uuid")
  id: string

  @Column({ type: "uuid" })
  @Index()
  userId: string

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: "userId" })
  user: User

  @Column({ type: "uuid" })
  fromCurrencyId: string

  @ManyToOne(() => Currency, { eager: true })
  @JoinColumn({ name: "fromCurrencyId" })
  fromCurrency: Currency

  @Column({ type: "uuid" })
  toCurrencyId: string

  @ManyToOne(() => Currency, { eager: true })
  @JoinColumn({ name: "toCurrencyId" })
  toCurrency: Currency

  @Column({ type: "decimal", precision: 18, scale: 8 })
  amount: number

  @Column({ type: "timestamp" })
  @Index()
  scheduledAt: Date

  @Column({
    type: "enum",
    enum: ScheduledTransferStatus,
    default: ScheduledTransferStatus.PENDING,
  })
  @Index()
  status: ScheduledTransferStatus

  @Column({ type: "timestamp", nullable: true })
  executedAt: Date

  @Column({ nullable: true })
  transactionId: string

  @Column({ type: "text", nullable: true })
  failureReason: string

  @Column({ nullable: true })
  destinationAddress: string

  @Column({ nullable: true })
  reference: string

  @Column({ type: "json", nullable: true })
  metadata: Record<string, any>

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}
