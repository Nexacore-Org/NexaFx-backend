import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StellarService } from '../blockchain/stellar/stellar.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly stellarService: StellarService,
  ) {}

  async checkHealth() {
    const dbStatus = await this.checkDatabase();
    const stellarStatus = await this.checkStellar();
    const cacheStatus = 'ok'; // Placeholder

    const isHealthy = dbStatus === 'ok' && stellarStatus === 'ok';

    return {
      status: isHealthy ? 'ok' : 'error',
      details: {
        database: dbStatus,
        stellar: stellarStatus,
        cache: cacheStatus,
      },
    };
  }

  private async checkDatabase(): Promise<string> {
    try {
      if (!this.dataSource.isInitialized) {
        return 'disconnected';
      }
      // Simple keep-alive query
      await this.dataSource.query('SELECT 1');
      return 'ok';
    } catch (error: any) {
      this.logger.error(`Database health check failed: ${error.message}`);
      return 'error';
    }
  }

  private async checkStellar(): Promise<string> {
    const isConnected = await this.stellarService.checkConnectivity();
    return isConnected ? 'ok' : 'error';
  }
}
