import 'reflect-metadata';
import { execSync } from 'child_process';
import { config } from 'dotenv';

config();

async function main() {
    if (['production', 'staging'].includes(process.env.NODE_ENV || '')) {
        throw new Error('Seeding is not allowed in production or staging environments.');
    }
    // Drop all tables
    execSync('npm run typeorm migration:revert -- -d src/database/data-source.ts || true', { stdio: 'inherit' });
    execSync('npm run typeorm migration:run -- -d src/database/data-source.ts', { stdio: 'inherit' });
    execSync('ts-node src/database/seed.ts', { stdio: 'inherit' });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
