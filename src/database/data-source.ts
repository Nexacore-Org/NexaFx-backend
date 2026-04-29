import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

// TypeORM CLI datasource for migrations and CLI commands
// synchronize: false and correct migrations config are set for safety
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false, // Never auto-sync in CLI
  logging: false,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
});
