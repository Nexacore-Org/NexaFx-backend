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

  @Column({ nullable: true })
  sdnType: string | null;

  @Column({ nullable: true })
  program: string | null;

  @Column({ nullable: true })
  title: string | null;

  @Column({ nullable: true })
  callSign: string | null;

  @Column({ nullable: true })
  vesselType: string | null;

  @Column({ nullable: true })
  tonnage: string | null;

  @Column({ nullable: true })
  grossRegisteredTonnage: string | null;

  @Column({ nullable: true })
  vesselFlag: string | null;

  @Column({ nullable: true })
  vesselOwner: string | null;

  @Column({ nullable: true })
  remarks: string | null;

  @Column({ type: 'jsonb', default: [] })
  aliases: string[];

  @CreateDateColumn()
  createdAt: Date;
}
