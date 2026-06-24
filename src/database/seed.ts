import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { runAllSeeders } from './seeders';
import { AppDataSource } from './datasource';

config();

async function main() {
    if (['production', 'staging'].includes(process.env.NODE_ENV || '')) {
        throw new Error('Seeding is not allowed in production or staging environments.');
    }
    await AppDataSource.initialize();
    await runAllSeeders(AppDataSource);
    await AppDataSource.destroy();
    console.log('Database seeded successfully.');
}

main().catch((err) => {
    const message = err instanceof Error ? err.message.replace(/[\r\n]/g, ' ') : String(err);
    console.error('Seed failed:', message);
    process.exit(1);
});
