import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('ofac_entries')
@Index(['normalizedName'])
export class OfacEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sdnName: string;

  @Column()
  normalizedName: string;

  @Column({ type: 'varchar', nullable: true })
  sdnType: string | null;

  @Column({ type: 'varchar', nullable: true })
  program: string | null;

  @Column({ type: 'varchar', nullable: true })
  title: string | null;

  @Column({ type: 'varchar', nullable: true })
  callSign: string | null;

  @Column({ type: 'varchar', nullable: true })
  vesselType: string | null;

  @Column({ type: 'varchar', nullable: true })
  tonnage: string | null;

  @Column({ type: 'varchar', nullable: true })
  grossRegisteredTonnage: string | null;

  @Column({ type: 'varchar', nullable: true })
  vesselFlag: string | null;

  @Column({ type: 'varchar', nullable: true })
  vesselOwner: string | null;

  @Column({ type: 'varchar', nullable: true })
  remarks: string | null;

  @Column({ type: 'jsonb', default: [] })
  aliases: string[];

  @CreateDateColumn()
  createdAt: Date;
}
