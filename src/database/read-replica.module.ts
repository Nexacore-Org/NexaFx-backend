import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ReadReplicaDataSourceProvider {
  public readonly readReplicaDataSource: DataSource;

  constructor(private configService: ConfigService) {
    const url = this.configService.get<string>('READ_REPLICA_DATABASE_URL');
    // If no replica URL, fallback to primary (handled elsewhere)
    this.readReplicaDataSource = new DataSource({
      type: 'postgres',
      url: url,
      synchronize: false,
      logging: false,
      // Limit pool size for replica
      // TypeORM pool options via extra: { max: 5 }
      extra: { max: 5 },
      entities: ['src/**/*.entity.ts'],
      migrations: ['src/migrations/*.ts'],
    });
    // Initialize asynchronously elsewhere (e.g., in module)
  }
}
