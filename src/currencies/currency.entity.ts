import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('currencies')
export class Currency {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 3, unique: true })
  code: string; // e.g., NGN, USD, EUR

  @Column({ type: 'varchar', length: 100 })
  name: string; // e.g., "Nigerian Naira"

  @Column({ type: 'int', default: 2 })
  decimals: number; // Number of decimal places

  @Column({ type: 'boolean', default: false })
  isBase: boolean; // True for NGN (base currency)

  @Column({ type: 'boolean', default: true })
  isActive: boolean; // Whether currency is currently supported

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
