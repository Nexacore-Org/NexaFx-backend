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
      await repository.query(`TRUNCATE TABLE "${entity.tableName}" CASCADE;`);
    } catch (error) {
      // Ignore tables that might not exist or can't be truncated
      console.warn(`Failed to truncate ${entity.tableName}:`, error.message);
    }
  }
}

/**
 * Seed a test user directly in the "users" table.
 * Bypasses the auth flow entirely — used when a spec needs a raw user row.
 */
export async function seedTestUser(
  dataSource: DataSource,
  options?: {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    isVerified?: boolean;
    isActive?: boolean;
  },
): Promise<any> {
  const email = options?.email || 'test@example.com';
  const rawPassword = options?.password || 'TestPassword123!';
  const firstName = options?.firstName || 'Test';
  const lastName = options?.lastName || 'User';
  const role = options?.role || 'USER';
  const isVerified = options?.isVerified ?? true;
  const isActive = options?.isActive ?? true;

  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  const result = await dataSource.query(
    `
    INSERT INTO "users" (
      email,
      password,
      "passwordHash",
      "firstName",
      "lastName",
      role,
      "isVerified",
      "isActive",
      "walletPublicKey",
      "walletSecretKeyEncrypted",
      "referralCode"
    )
    VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
    `,
    [
      email,
      hashedPassword,
      firstName,
      lastName,
      role,
      isVerified,
      isActive,
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      'encrypted-test-secret',
      generateReferralCode(),
    ],
  );

  return result[0];
}

/**
 * Seed an admin user directly in the "users" table.
 * Returns the row with the plaintext password for login flows.
 */
export async function seedAdminUser(
  dataSource: DataSource,
  options?: {
    email?: string;
    password?: string;
  },
): Promise<any> {
  return seedTestUser(dataSource, {
    email: options?.email || 'admin@example.com',
    password: options?.password || 'AdminPassword123!',
    firstName: 'Admin',
    lastName: 'User',
    role: 'ADMIN',
  });
}

/**
 * Seed a super-admin user directly in the "users" table.
 * Returns the row with the plaintext password for login flows.
 */
export async function seedSuperAdminUser(
  dataSource: DataSource,
  options?: {
    email?: string;
    password?: string;
  },
): Promise<any> {
  return seedTestUser(dataSource, {
    email: options?.email || 'superadmin@example.com',
    password: options?.password || 'SuperAdminPassword123!',
    firstName: 'Super',
    lastName: 'Admin',
    role: 'SUPER_ADMIN',
  });
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
      ORDER BY "createdAt" DESC
      LIMIT 1
      `,
      [email],
    );
    return result[0]?.code || null;
  } catch {
    return null;
  }
}

/**
 * Truncate all tables.
 * Called once before all tests in a suite.
 */
export async function setupTestDatabase(dataSource: DataSource): Promise<void> {
  await truncateAll(dataSource);
}

/** Random 8-char uppercase referral code; unique per seed call. */
function generateReferralCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}
