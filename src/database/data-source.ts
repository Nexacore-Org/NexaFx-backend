import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

const isProd = process.env.NODE_ENV === 'production';
const isDev = process.env.NODE_ENV === 'development';

// TypeORM CLI datasource for migrations and CLI commands
// synchronize: false and correct migrations config are set for safety
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false, // Never auto-sync in CLI
  logging: isDev,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts', 'src/database/migrations/*.ts'],
  extra: {
    max: 10,
    idleTimeoutMillis: 30000,
  },
  ssl: isProd ? { rejectUnauthorized: false } : false,
});