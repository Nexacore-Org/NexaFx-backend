import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('ratelocks')
export class RateLock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  expiresAt: Date;
}

