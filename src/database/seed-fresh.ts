import 'reflect-metadata';
import { execSync } from 'child_process';
import { config } from 'dotenv';
import { AppDataSource as dataSource } from './data-source';

config();

async function main() {
  if (['production', 'staging'].includes(process.env.NODE_ENV || '')) {
    throw new Error(
      'Seeding is not allowed in production or staging environments.',
    );
  }

  await dataSource.initialize();
  try {
    await dataSource.query('DROP SCHEMA public CASCADE');
    await dataSource.query('CREATE SCHEMA public');
  } finally {
    await dataSource.destroy();
  }

  execSync('npm run typeorm:migration:run', { stdio: 'inherit' });
  execSync('npm run seed', { stdio: 'inherit' });
}

main().catch((err) => {
  const message =
    err instanceof Error ? err.message.replace(/[\r\n]/g, ' ') : String(err);
  console.error('Seed-fresh failed:', message);
  process.exit(1);
});
