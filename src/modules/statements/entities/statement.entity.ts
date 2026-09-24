import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { User } from '../../../users/user.entity';

@Entity('statements')
@Unique(['userId', 'currency', 'year', 'month'])
export class Statement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'int' })
  month: number;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  openingBalance: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  closingBalance: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  totalCredits: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  totalDebits: string;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  totalFees: string;

  @Column({ type: 'int' })
  transactionCount: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  pdfKey: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  csvKey: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
