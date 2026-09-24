import { Injectable, Logger } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { readReplicaDataSource } from './read-replica.module';
import { AppDataSource } from './data-source'; // primary datasource

@Injectable()
export class ReadReplicaService {
  private readonly logger = new Logger(ReadReplicaService.name);
  private readonly lagThreshold: number;

  constructor(private readonly config: ConfigService) {
    this.lagThreshold = Number(process.env.REPLICA_LAG_THRESHOLD_SECONDS ?? '30');
  }

  private async getReplicaLagSeconds(): Promise<number> {
    if (!process.env.READ_REPLICA_DATABASE_URL) {
      return Infinity;
    }
    try {
      const result = await readReplicaDataSource.query(
        `SELECT EXTRACT(EPOCH FROM (NOW() - pg_last_xact_replay_timestamp())) as lag`,
      );
      return Number(result[0]?.lag ?? Infinity);
    } catch (err) {
      this.logger.warn(`Read replica lag check error: ${err?.message}`);
      return Infinity;
    }
  }

  /**
   * Returns a repository bound to appropriate datasource.
   * Falls back to primary if replica unavailable or lag exceeds threshold.
   */
  async getReadRepository<T>(entity: new () => T): Promise<Repository<T>> {
    const lag = await this.getReplicaLagSeconds();
    if (lag <= this.lagThreshold) {
      return readReplicaDataSource.getRepository(entity);
    }
    this.logger.warn(
      `[ReadReplica] Falling back to primary – lag: ${lag}s (threshold ${this.lagThreshold}s)`,
    );
    return AppDataSource.getRepository(entity);
  }
}
