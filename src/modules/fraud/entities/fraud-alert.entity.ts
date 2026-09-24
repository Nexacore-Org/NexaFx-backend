import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum FraudAlertType {
  IMPOSSIBLE_TRAVEL = 'IMPOSSIBLE_TRAVEL',
  HIGH_RISK_COUNTRY = 'HIGH_RISK_COUNTRY',
  SUSPICIOUS_IP = 'SUSPICIOUS_IP',
  HIGH_RISK_SCORE = 'HIGH_RISK_SCORE',
}

export enum FraudAlertStatus {
  OPEN = 'OPEN',
  REVIEWED = 'REVIEWED',
  DISMISSED = 'DISMISSED',
}

@Entity('fraud_alerts')
export class FraudAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  loginAttemptId: string | null;

  @Column({
    type: 'enum',
    enum: FraudAlertType,
  })
  @Index()
  alertType: FraudAlertType;

  @Column({ type: 'int', default: 0 })
  riskScore: number;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, any> | null;

  @Column({
    type: 'enum',
    enum: FraudAlertStatus,
    default: FraudAlertStatus.OPEN,
  })
  @Index()
  status: FraudAlertStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
