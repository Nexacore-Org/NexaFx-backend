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

    // Return minimal database health information required by acceptance tests
    return {
      database: {
        status: dbStatus === 'ok' ? 'up' : 'down',
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
