import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('sandbox_request_logs')
export class SandboxRequestLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column({ type: 'uuid' })
  sandboxAccountId: string;
  @Column({ type: 'varchar', length: 10 })
  method: string;
  @Column({ type: 'varchar', length: 500 })
  path: string;
  @Column({ type: 'int' })
  statusCode: number;
  @Column({ type: 'int' })
  durationMs: number;
  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
