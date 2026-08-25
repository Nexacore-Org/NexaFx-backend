import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { User } from '../../../users/user.entity';

@Entity('sandbox_accounts')
export class SandboxAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ type: 'uuid' })
  userId: string;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
  @Column({ type: 'varchar', length: 255, unique: true })
  sandboxApiKey: string;
  @Column({ type: 'int', default: 0 })
  resetCount: number;
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
