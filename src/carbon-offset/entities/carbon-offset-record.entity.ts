import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('carbon_offset_records')
export class CarbonOffsetRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  transactionId: string | null;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amountXlm: string;

  // Display-only CO2 equivalent, not a scientific claim (#696).
  @Column({ type: 'decimal', precision: 10, scale: 6 })
  equivalentKgCo2: string;

  @CreateDateColumn()
  createdAt: Date;
}
