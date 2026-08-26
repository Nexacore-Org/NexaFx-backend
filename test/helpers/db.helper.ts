import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

/**
 * Truncate all tables in the database
 * Keep schema intact for speed
 */
export async function truncateAll(dataSource: DataSource): Promise<void> {
  const entities = dataSource.entityMetadatas;
  
  for (const entity of entities) {
    try {
      const repository = dataSource.getRepository(entity.name);
      await repository.query(
        `TRUNCATE TABLE "${entity.tableName}" CASCADE;`,
      );
    } catch (error) {
      // Ignore tables that might not exist or can't be truncated
      console.warn(`Failed to truncate ${entity.tableName}:`, error.message);
    }
  }
}

/**
 * Seed a test user in the database
 */
export async function seedTestUser(
  dataSource: DataSource,
  options?: {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    isVerified?: boolean;
    isActive?: boolean;
    kycStatus?: string;
  },
): Promise<any> {
  const email = options?.email || 'test@example.com';
  const rawPassword = options?.password || 'TestPassword123!';
  const firstName = options?.firstName || 'Test';
  const lastName = options?.lastName || 'User';
  const isVerified = options?.isVerified ?? true;
  const isActive = options?.isActive ?? true;

  // Hash password using bcrypt (same logic as auth service)
  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  // Insert user into users table
  const result = await dataSource.query(
    `
    INSERT INTO "user" (
      email, 
      password, 
      first_name, 
      last_name, 
      is_verified, 
      is_active,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    RETURNING *
    `,
    [email, hashedPassword, firstName, lastName, isVerified, isActive],
  );

  const user = result[0];

  // If specified, set KYC status
  if (options?.kycStatus) {
    await dataSource.query(
      `
      UPDATE "user" 
      SET kyc_status = $1 
      WHERE id = $2
      `,
      [options.kycStatus, user.id],
    );
    user.kycStatus = options.kycStatus;
  }

  return user;
}

/**
 * Seed an admin user
 */
export async function seedAdminUser(
  dataSource: DataSource,
  options?: {
    email?: string;
    password?: string;
  },
): Promise<any> {
  const email = options?.email || 'admin@example.com';
  const rawPassword = options?.password || 'AdminPassword123!';

  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  const result = await dataSource.query(
    `
    INSERT INTO "user" (
      email, 
      password, 
      first_name, 
      last_name, 
      is_verified, 
      is_active,
      role,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    RETURNING *
    `,
    [email, hashedPassword, 'Admin', 'User', true, true, 'ADMIN'],
  );

  return result[0];
}

/**
 * Create a KYC application for a user
 */
export async function createKycApplication(
  dataSource: DataSource,
  userId: string,
  status: string = 'PENDING',
): Promise<any> {
  const result = await dataSource.query(
    `
    INSERT INTO "kyc_application" (
      user_id,
      status,
      tier,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, NOW(), NOW())
    RETURNING *
    `,
    [userId, status, 'STANDARD'],
  );

  return result[0];
}

/**
 * Get stored OTP for testing (if available in DB)
 * Used to verify OTP-based flows without email access
 */
export async function getLatestOtp(
  dataSource: DataSource,
  email: string,
): Promise<string | null> {
  try {
    const result = await dataSource.query(
      `
      SELECT code 
      FROM "otp" 
      WHERE email = $1 
      ORDER BY created_at DESC 
      LIMIT 1
      `,
      [email],
    );
    return result[0]?.code || null;
  } catch (error) {
    return null;
  }
}

/**
 * Clear all data and run migrations
 * Called once before all tests in a suite
 */
export async function setupTestDatabase(
  dataSource: DataSource,
): Promise<void> {
  // Run pending migrations
  try {
    await dataSource.runMigrations();
  } catch (error) {
    // Migrations might already be run
    console.warn('Migrations already run or skipped:', error.message);
  }

  // Truncate all tables
  await truncateAll(dataSource);
}
