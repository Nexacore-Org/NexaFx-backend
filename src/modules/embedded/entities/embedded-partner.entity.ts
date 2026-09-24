import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('embedded_partners')
export class EmbeddedPartner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 500 })
  webhookUrl: string;

  @Column({ type: 'simple-array', nullable: true })
  allowedScopes: string[];

  @Column({ type: 'varchar', length: 100, unique: true })
  clientId: string;

  @Column({ type: 'varchar', length: 255 })
  clientSecretHash: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 7, nullable: true })
  brandColour: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logoUrl: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
