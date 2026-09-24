import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { EmbeddedPartner } from './embedded-partner.entity';

@Entity('partner_users')
export class PartnerUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  partnerId: string;

  @ManyToOne(() => EmbeddedPartner)
  @JoinColumn({ name: 'partnerId' })
  partner: EmbeddedPartner;

  @Column({ type: 'varchar', length: 255 })
  partnerUserId: string;

  @Column({ type: 'uuid' })
  nexafxUserId: string;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
