import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { createTestApp } from '../helpers/app.helper';
import { truncateAll, getLatestOtp, seedTestUser, setupTestDatabase } from '../helpers/db.helper';

describe('Authentication E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);

    // Set up test database
    await setupTestDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Truncate database before each test
    await truncateAll(dataSource);
  });

  describe('POST /auth/signup', () => {
    it('should register a new user and send OTP', async () => {
      const signupDto = {
        email: 'newuser@example.com',
        password: 'SecurePassword123!',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
      };

      const response = await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send(signupDto)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('OTP');
    });

    it('should reject duplicate email with 409', async () => {
      const email = 'duplicate@example.com';
      
      // Create first user
      await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send({
          email,
          password: 'SecurePassword123!',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1234567890',
        })
        .expect(200);

      // Try to register with same email
      await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send({
          email,
          password: 'DifferentPassword123!',
          firstName: 'Jane',
          lastName: 'Smith',
          phone: '+0987654321',
        })
        .expect(409);
    });

    it('should reject invalid email format', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send({
          email: 'invalid-email',
          password: 'SecurePassword123!',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1234567890',
        })
        .expect(400);
    });

    it('should reject weak password', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send({
          email: 'test@example.com',
          password: 'weak',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1234567890',
        })
        .expect(400);
    });
  });

  describe('POST /auth/verify-signup-otp', () => {
    it('should complete signup with valid OTP', async () => {
      const email = 'verify@example.com';
      const password = 'SecurePassword123!';

      // Initial signup
      await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send({
          email,
          password,
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1234567890',
        })
        .expect(200);

      // Get OTP from database
      const otp = await getLatestOtp(dataSource, email);
      expect(otp).toBeTruthy();

      // Verify signup with OTP
      const response = await request(app.getHttpServer())
        .post('/v1/auth/verify-signup-otp')
        .send({
          email,
          otp,
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(email);
    });

    it('should reject invalid OTP with 401', async () => {
      const email = 'invalid-otp@example.com';

      // Initial signup
      await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send({
          email,
          password: 'SecurePassword123!',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1234567890',
        })
        .expect(200);

      // Try with invalid OTP
      await request(app.getHttpServer())
        .post('/v1/auth/verify-signup-otp')
        .send({
          email,
          otp: '000000',
        })
        .expect(401);
    });
  });

  describe('POST /auth/login', () => {
    it('should send OTP for valid credentials', async () => {
      const email = 'login@example.com';
      const password = 'LoginPassword123!';

      // Sign up user first
      await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send({
          email,
          password,
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1234567890',
        })
        .expect(200);

      // Verify signup
      const signupOtp = await getLatestOtp(dataSource, email);
      await request(app.getHttpServer())
        .post('/v1/auth/verify-signup-otp')
        .send({ email, otp: signupOtp })
        .expect(200);

      // Now login
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password })
        .expect(200);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('OTP');
    });

    it('should return generic message for non-existent email', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        })
        .expect(200);

      // Should return generic message for security
      expect(response.body).toHaveProperty('message');
    });

    it('should return generic message for wrong password', async () => {
      const email = 'wrongpw@example.com';
      const password = 'CorrectPassword123!';

      // Sign up user
      await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send({
          email,
          password,
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1234567890',
        })
        .expect(200);

      // Verify signup
      const signupOtp = await getLatestOtp(dataSource, email);
      await request(app.getHttpServer())
        .post('/v1/auth/verify-signup-otp')
        .send({ email, otp: signupOtp })
        .expect(200);

      // Try wrong password
      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({
          email,
          password: 'WrongPassword123!',
        })
        .expect(200);

      // Should return generic message for security
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('POST /auth/verify-login-otp', () => {
    it('should complete login with valid OTP', async () => {
      const email = 'login-verify@example.com';
      const password = 'LoginPassword123!';

      // Create verified user
      await seedTestUser(dataSource, { email, password });

      // Send login OTP
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password })
        .expect(200);

      // Get OTP from database
      const otp = await getLatestOtp(dataSource, email);
      expect(otp).toBeTruthy();

      // Verify login with OTP
      const response = await request(app.getHttpServer())
        .post('/v1/auth/verify-login-otp')
        .send({ email, otp })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(email);
    });

    it('should reject invalid login OTP with 401', async () => {
      const email = 'login-invalid@example.com';

      // Create user
      await seedTestUser(dataSource, { email, password: 'Password123!' });

      // Send login OTP
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password: 'Password123!' })
        .expect(200);

      // Try with invalid OTP
      await request(app.getHttpServer())
        .post('/v1/auth/verify-login-otp')
        .send({ email, otp: '000000' })
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should refresh access token with valid refresh token', async () => {
      const email = 'refresh@example.com';
      const password = 'RefreshPassword123!';

      // Create user and complete signup
      await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send({
          email,
          password,
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1234567890',
        })
        .expect(200);

      const otp = await getLatestOtp(dataSource, email);
      const signupResponse = await request(app.getHttpServer())
        .post('/v1/auth/verify-signup-otp')
        .send({ email, otp })
        .expect(200);

      const refreshToken = signupResponse.body.refreshToken;

      // Use refresh token
      const response = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('expiresIn');
    });

    it('should reject invalid refresh token with 401', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);
    });

    it('should reject missing refresh token with 400', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({})
        .expect(400);
    });
  });

  describe('Protected Routes', () => {
    it('should return 401 when accessing protected route without token', async () => {
      await request(app.getHttpServer())
        .get('/v1/kyc/status')
        .expect(401);
    });

    it('should reject invalid token with 401', async () => {
      await request(app.getHttpServer())
        .get('/v1/kyc/status')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should accept valid token', async () => {
      const email = 'protected@example.com';
      const password = 'ProtectedPassword123!';

      // Create and verify user
      await request(app.getHttpServer())
        .post('/v1/auth/signup')
        .send({
          email,
          password,
          firstName: 'John',
          lastName: 'Doe',
          phone: '+1234567890',
        })
        .expect(200);

      const otp = await getLatestOtp(dataSource, email);
      const signupResponse = await request(app.getHttpServer())
        .post('/v1/auth/verify-signup-otp')
        .send({ email, otp })
        .expect(200);

      const accessToken = signupResponse.body.accessToken;

      // Access protected route with valid token
      const response = await request(app.getHttpServer())
        .get('/v1/kyc/status')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toBeDefined();
    });
  });
});
