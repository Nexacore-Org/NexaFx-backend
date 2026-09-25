import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { createTestApp } from '../helpers/app.helper';
import { truncateAll, seedTestUser } from '../helpers/db.helper';

/**
 * End-to-end coverage for GraphQL resolver authentication and query correctness.
 *
 * Exercises the real NestJS module graph (guards, pipes, resolvers) against a
 * real test database. Only true external boundaries are mocked.
 */
describe('GraphQL (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let httpServer: any;

  const gql = (query: string, variables?: Record<string, any>) =>
    request(httpServer)
      .post('/graphql')
      .send({ query, variables });

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    httpServer = app.getHttpServer();
    await truncateAll(dataSource);
  });

  afterAll(async () => {
    if (dataSource) {
      await truncateAll(dataSource);
    }
    if (app) {
      await app.close();
    }
  });

  describe('authentication', () => {
    it('rejects an unauthenticated query that requires auth', async () => {
      const res = await gql('{ me { id } }');

      // Must not return partial/null data that could be mistaken for a valid
      // empty response — it must be an explicit auth error.
      expect(res.body.data?.me ?? null).toBeNull();
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.length).toBeGreaterThan(0);

      const status = res.status;
      const message = JSON.stringify(res.body.errors).toLowerCase();
      expect(status === 401 || message.includes('unauthorized')).toBe(true);
    });

    it('returns the authenticated user for { me { id } }', async () => {
      const user = await seedTestUser(dataSource, {
        email: 'gql-me@example.com',
      });

      const login = await request(httpServer)
        .post('/auth/login')
        .send({ email: 'gql-me@example.com', password: 'TestPassword123!' });

      const token =
        login.body?.accessToken ||
        login.body?.access_token ||
        login.body?.token;

      expect(token).toBeDefined();

      const res = await gql('{ me { id } }').set(
        'Authorization',
        `Bearer ${token}`,
      );

      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.me.id).toBe(String(user.id));
    });
  });

  describe('query depth limiting', () => {
    it('rejects a query that exceeds the configured depth limit', async () => {
      // Build a deeply nested selection set that exceeds the configured limit.
      let selection = 'id';
      for (let i = 0; i < 30; i += 1) {
        selection = `transactions(limit: 1) { ${selection} }`;
      }
      const deepQuery = `{ me { ${selection} } }`;

      const res = await gql(deepQuery);

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.length).toBeGreaterThan(0);
      expect(res.body.data?.me ?? null).toBeNull();

      const message = JSON.stringify(res.body.errors).toLowerCase();
      expect(
        message.includes('depth') ||
          message.includes('too complex') ||
          message.includes('exceed'),
      ).toBe(true);
    });
  });

  describe('introspection', () => {
    const introspectionQuery = '{ __schema { queryType { name } } }';

    it('is enabled outside production', async () => {
      const res = await gql(introspectionQuery);

      expect(res.body.errors).toBeUndefined();
      expect(res.body.data.__schema.queryType.name).toBeDefined();
    });

    it('is disabled when NODE_ENV=production', async () => {
      const previousEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      let prodApp: INestApplication | undefined;
      try {
        prodApp = await createTestApp();
        const prodServer = prodApp.getHttpServer();

        const res = await request(prodServer)
          .post('/graphql')
          .send({ query: introspectionQuery });

        expect(res.body.data?.__schema ?? null).toBeNull();
        expect(res.body.errors).toBeDefined();
        expect(res.body.errors.length).toBeGreaterThan(0);
      } finally {
        if (prodApp) {
          await prodApp.close();
        }
        if (previousEnv === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = previousEnv;
        }
      }
    });
  });

  describe('transactions query scoping', () => {
    it('returns only the requesting user\'s own transactions', async () => {
      const owner = await seedTestUser(dataSource, {
        email: 'gql-owner@example.com',
      });
      const other = await seedTestUser(dataSource, {
        email: 'gql-other@example.com',
      });

      await dataSource.query(
        `INSERT INTO "transactions" ("userId", type, amount, status, "createdAt", "updatedAt")
         VALUES ($1, 'DEPOSIT', 100, 'COMPLETED', NOW(), NOW())`,
        [owner.id],
      );
      await dataSource.query(
        `INSERT INTO "transactions" ("userId", type, amount, status, "createdAt", "updatedAt")
         VALUES ($1, 'DEPOSIT', 999, 'COMPLETED', NOW(), NOW())`,
        [other.id],
      );

      const login = await request(httpServer)
        .post('/auth/login')
        .send({ email: 'gql-owner@example.com', password: 'TestPassword123!' });

      const token =
        login.body?.accessToken ||
        login.body?.access_token ||
        login.body?.token;

      expect(token).toBeDefined();

      const res = await gql('{ transactions(limit: 10) { id amount } }').set(
        'Authorization',
        `Bearer ${token}`,
      );

      expect(res.body.errors).toBeUndefined();
      const transactions = res.body.data.transactions;
      expect(Array.isArray(transactions)).toBe(true);
      expect(transactions.length).toBe(1);
      expect(Number(transactions[0].amount)).toBe(100);
    });
  });
});
