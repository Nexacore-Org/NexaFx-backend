import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { runAllSeeders } from './seeders';
import { dataSource } from './data-source';

config();

async function main() {
    if (['production', 'staging'].includes(process.env.NODE_ENV || '')) {
        throw new Error('Seeding is not allowed in production or staging environments.');
    }
    await dataSource.initialize();
    await runAllSeeders(dataSource);
    await dataSource.destroy();
    console.log('Database seeded successfully.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
