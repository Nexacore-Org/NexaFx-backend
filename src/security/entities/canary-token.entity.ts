import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum CanaryType {
  API_USER = 'API_USER',
  FIELD = 'FIELD',
  EXPORT = 'EXPORT',
}

@Entity('canary_tokens')
export class CanaryToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: CanaryType })
  type: CanaryType;

  @Column({ unique: true })
  token: string; // Stored match signature (e.g., canary-uuid@nexafx-trap.com or CANARY-uuid)

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: false })
  isTriggered: boolean;

  @Column({ type: 'timestamp', nullable: true })
  triggeredAt: Date;

  @Column({ nullable: true })
  triggeredBy: string; // IP Address, Actor ID, or Request URI string

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}