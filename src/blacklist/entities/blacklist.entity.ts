import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('blacklist')
export class Blacklist {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  walletAddress: string;

  @Column({ default: false })
  isFrozen: boolean;
}


