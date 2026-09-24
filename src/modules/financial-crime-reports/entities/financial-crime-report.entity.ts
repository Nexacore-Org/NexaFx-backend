import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Sar } from '../../compliance/entities/sar.entity';

export enum FinancialCrimeReportFormat {
  /** goAML 4.0 — Nigerian Financial Intelligence Unit. */
  GOAML = 'GOAML',
  /** NCA suspicious activity report — United Kingdom. */
  NCA_UK = 'NCA_UK',
  /** Regulator-neutral export. */
  GENERIC = 'GENERIC',
}

export enum FinancialCrimeReportStatus {
  /** Generated and validated, not yet sent to the regulator. */
  DRAFT = 'DRAFT',
  /** Submitted to the regulator; `submissionReference` holds their reference. */
  SUBMITTED = 'SUBMITTED',
  /** The regulator has confirmed receipt. */
  ACKNOWLEDGED = 'ACKNOWLEDGED',
}

@Index(['sarId'])
@Index(['status', 'createdAt'])
@Entity('financial_crime_reports')
export class FinancialCrimeReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sarId: string;

  @ManyToOne(() => Sar, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sarId' })
  sar: Sar;

  @Column({ type: 'varchar', length: 20 })
  format: FinancialCrimeReportFormat;

  /** The generated XML, stored verbatim so a submission can be reproduced. */
  @Column({ type: 'text' })
  xmlContent: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: FinancialCrimeReportStatus.DRAFT,
  })
  status: FinancialCrimeReportStatus;

  @Column({ type: 'timestamp', nullable: true })
  submittedAt: Date | null;

  /** Reference the regulator returned on receipt. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  submissionReference: string | null;

  /** Admin who generated the report, retained for the audit trail. */
  @Column({ type: 'uuid', nullable: true })
  generatedById: string | null;

  /** Admin who recorded the submission. */
  @Column({ type: 'uuid', nullable: true })
  submittedById: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
