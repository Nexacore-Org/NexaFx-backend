import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Currency } from '../currencies/entities/currency.entity';

export const typeOrmConfig: TypeOrmModuleOptions = {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'nexafx',
    entities: [Transaction, Currency],
    synchronize: process.env.NODE_ENV !== 'production', // Set to false in production
    logging: process.env.NODE_ENV !== 'production',
}; 