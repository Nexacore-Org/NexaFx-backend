import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { createTestApp } from '../helpers/app.helper';
import { truncateAll, setupTestDatabase } from '../helpers/db.helper';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Seed a verified user directly into the DB and mint a JWT for them. */
async function seedUserAndGetToken(
  dataSource: DataSource,
  opts: { email: string; role?: string } = { email: 'webhook-user@example.com' },
): Promise<{ userId: string; token: string }> {
  const email = opts.email;
  const role = opts.role ?? 'USER';
  const secret =
    process.env.JWT_SECRET || 'default-secret-change-in-production';

  const rows = await dataSource.query(
    `INSERT INTO users (
       email, "passwordHash", "walletPublicKey", "walletSecretKeyEncrypted",
       "referralCode", role, "isActive", "isVerified", "createdAt", "updatedAt"
     )
     VALUES ($1, $2, $3, $4, $5, $6, true, true, NOW(), NOW())
     RETURNING id`,
    [
      email,
      'hashed-pw',
      'G' + 'A'.repeat(55),
      'enc-secret',
      Math.random().toString(36).slice(2, 10).toUpperCase(),
      role,
    ],
  );

  const userId: string = rows[0].id;
  const token = jwt.sign({ sub: userId, email, role }, secret, {
    expiresIn: '1h',
  });

  return { userId, token };
}

/** Create a webhook endpoint via the API and return the response body. */
async function createEndpoint(
  app: INestApplication,
  token: string,
  overrides: Record<string, unknown> = {},
) {
  const body = {
    url: 'https://webhook.site/test-nexafx',
    events: ['transaction.completed'],
    ...overrides,
  };
  const res = await request(app.getHttpServer())
    .post('/v1/webhooks')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  return res;
}

// ─── suite ───────────────────────────────────────────────────────────────────

describe('Webhooks E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userToken: string;
  let userId: string;
  let otherToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await setupTestDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);
    ({ token: userToken, userId } = await seedUserAndGetToken(dataSource, {
      email: 'webhook-user@example.com',
    }));
    ({ token: otherToken } = await seedUserAndGetToken(dataSource, {
      email: 'other-user@example.com',
    }));
  });

  // ── POST /v1/webhooks ────────────────────────────────────────────────────

  describe('POST /v1/webhooks', () => {
    it('creates an endpoint for an authenticated user (201)', async () => {
      const res = await createEndpoint(app, userToken);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('url', 'https://webhook.site/test-nexafx');
      expect(res.body.events).toContain('transaction.completed');
      expect(res.body).toHaveProperty('isActive', true);
      // Secret must never be exposed in create response
      expect(res.body.secret).toBeUndefined();
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/webhooks')
        .send({
          url: 'https://webhook.site/test-nexafx',
          events: ['transaction.completed'],
        });

      expect(res.status).toBe(401);
    });

    it('rejects HTTP (non-HTTPS) URLs with 400', async () => {
      const res = await createEndpoint(app, userToken, {
        url: 'http://example.com/hook',
      });

      expect(res.status).toBe(400);
    });

    it('rejects private/localhost URLs with 400', async () => {
      const res = await createEndpoint(app, userToken, {
        url: 'https://localhost/hook',
      });

      expect(res.status).toBe(400);
    });

    it('rejects an invalid URL string with 400', async () => {
      const res = await createEndpoint(app, userToken, {
        url: 'not-a-url',
      });

      expect(res.status).toBe(400);
    });

    it('accepts a valid preferredSchemaVersion (2.0)', async () => {
      const res = await createEndpoint(app, userToken, {
        preferredSchemaVersion: '2.0',
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('preferredSchemaVersion', '2.0');
    });

    it('rejects unsupported schema version with 400', async () => {
      const res = await createEndpoint(app, userToken, {
        preferredSchemaVersion: '99.0',
      });

      expect(res.status).toBe(400);
    });
  });

  // ── GET /v1/webhooks ─────────────────────────────────────────────────────

  describe('GET /v1/webhooks', () => {
    it('lists endpoints for the authenticated user (200)', async () => {
      // Create two endpoints
      await createEndpoint(app, userToken);
      await createEndpoint(app, userToken, {
        url: 'https://webhook.site/test-nexafx-2',
        events: ['kyc.approved'],
      });

      const res = await request(app.getHttpServer())
        .get('/v1/webhooks')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      // Secret must be stripped from list responses
      res.body.forEach((ep: Record<string, unknown>) => {
        expect(ep.secret).toBeUndefined();
      });
    });

    it('returns an empty array when the user has no endpoints', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/webhooks')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body).toEqual([]);
    });

    it('does not leak other users\' endpoints', async () => {
      await createEndpoint(app, otherToken);

      const res = await request(app.getHttpServer())
        .get('/v1/webhooks')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body).toHaveLength(0);
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .get('/v1/webhooks')
        .expect(401);
    });
  });

  // ── GET /v1/webhooks/schema-versions ─────────────────────────────────────

  describe('GET /v1/webhooks/schema-versions', () => {
    it('returns schema version registry (authenticated, 200)', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/webhooks/schema-versions')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      const versions = res.body.map((v: Record<string, unknown>) => v.version);
      expect(versions).toContain('1.0');
      expect(versions).toContain('2.0');
    });

    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .get('/v1/webhooks/schema-versions')
        .expect(401);
    });
  });

  // ── PATCH /v1/webhooks/:id ────────────────────────────────────────────────

  describe('PATCH /v1/webhooks/:id', () => {
    it('updates the endpoint URL (200)', async () => {
      const created = await createEndpoint(app, userToken);
      const endpointId: string = created.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/v1/webhooks/${endpointId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ url: 'https://webhook.site/updated' })
        .expect(200);

      expect(res.body).toHaveProperty('url', 'https://webhook.site/updated');
    });

    it('updates isActive flag (200)', async () => {
      const created = await createEndpoint(app, userToken);
      const endpointId: string = created.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/v1/webhooks/${endpointId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ isActive: false })
        .expect(200);

      expect(res.body).toHaveProperty('isActive', false);
    });

    it('updates events array (200)', async () => {
      const created = await createEndpoint(app, userToken);
      const endpointId: string = created.body.id;

      const res = await request(app.getHttpServer())
        .patch(`/v1/webhooks/${endpointId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ events: ['kyc.approved', 'transaction.failed'] })
        .expect(200);

      expect(res.body.events).toEqual(['kyc.approved', 'transaction.failed']);
    });

    it('returns 400 when PATCH URL is HTTP (not HTTPS)', async () => {
      const created = await createEndpoint(app, userToken);
      const endpointId: string = created.body.id;

      await request(app.getHttpServer())
        .patch(`/v1/webhooks/${endpointId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ url: 'http://insecure.example.com/hook' })
        .expect(400);
    });

    it('returns 400 for unsupported schema version in PATCH', async () => {
      const created = await createEndpoint(app, userToken);
      const endpointId: string = created.body.id;

      await request(app.getHttpServer())
        .patch(`/v1/webhooks/${endpointId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ preferredSchemaVersion: '3.0' })
        .expect(400);
    });

    it('prevents patching another user\'s endpoint (400)', async () => {
      const created = await createEndpoint(app, otherToken);
      const endpointId: string = created.body.id;

      await request(app.getHttpServer())
        .patch(`/v1/webhooks/${endpointId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ isActive: false })
        .expect(400);
    });

    it('rejects unauthenticated PATCH with 401', async () => {
      const created = await createEndpoint(app, userToken);
      const endpointId: string = created.body.id;

      await request(app.getHttpServer())
        .patch(`/v1/webhooks/${endpointId}`)
        .send({ isActive: false })
        .expect(401);
    });
  });

  // ── DELETE /v1/webhooks/:id ───────────────────────────────────────────────

  describe('DELETE /v1/webhooks/:id', () => {
    it('deletes own endpoint and returns { success: true }', async () => {
      const created = await createEndpoint(app, userToken);
      const endpointId: string = created.body.id;

      const res = await request(app.getHttpServer())
        .delete(`/v1/webhooks/${endpointId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body).toEqual({ success: true });

      // Confirm the endpoint is gone from the list
      const list = await request(app.getHttpServer())
        .get('/v1/webhooks')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(list.body).toHaveLength(0);
    });

    it('silently succeeds when deleting a non-existent endpoint', async () => {
      // TypeORM delete on a missing row doesn't throw — DELETE is idempotent
      await request(app.getHttpServer())
        .delete('/v1/webhooks/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it('rejects unauthenticated DELETE with 401', async () => {
      const created = await createEndpoint(app, userToken);
      const endpointId: string = created.body.id;

      await request(app.getHttpServer())
        .delete(`/v1/webhooks/${endpointId}`)
        .expect(401);
    });
  });

  // ── GET /v1/webhooks/:id/deliveries ──────────────────────────────────────

  describe('GET /v1/webhooks/:id/deliveries', () => {
    it('returns an empty delivery history for a new endpoint (200)', async () => {
      const created = await createEndpoint(app, userToken);
      const endpointId: string = created.body.id;

      const res = await request(app.getHttpServer())
        .get(`/v1/webhooks/${endpointId}/deliveries`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });

    it('returns 400 when endpoint does not belong to user', async () => {
      const created = await createEndpoint(app, otherToken);
      const endpointId: string = created.body.id;

      await request(app.getHttpServer())
        .get(`/v1/webhooks/${endpointId}/deliveries`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const created = await createEndpoint(app, userToken);
      const endpointId: string = created.body.id;

      await request(app.getHttpServer())
        .get(`/v1/webhooks/${endpointId}/deliveries`)
        .expect(401);
    });
  });

  // ── POST /v1/webhooks/:id/test ────────────────────────────────────────────

  describe('POST /v1/webhooks/:id/test', () => {
    it('fires a test ping and returns { success: true } (200)', async () => {
      const created = await createEndpoint(app, userToken);
      const endpointId: string = created.body.id;

      const res = await request(app.getHttpServer())
        .post(`/v1/webhooks/${endpointId}/test`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body).toEqual({ success: true });
    });

    it('returns 400 when endpoint does not belong to user', async () => {
      const created = await createEndpoint(app, otherToken);
      const endpointId: string = created.body.id;

      await request(app.getHttpServer())
        .post(`/v1/webhooks/${endpointId}/test`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const created = await createEndpoint(app, userToken);
      const endpointId: string = created.body.id;

      await request(app.getHttpServer())
        .post(`/v1/webhooks/${endpointId}/test`)
        .expect(401);
    });
  });

  // ── POST /v1/webhooks/:id/redeliver/:deliveryId ───────────────────────────

  describe('POST /v1/webhooks/:id/redeliver/:deliveryId', () => {
    it('returns 400 when delivery does not exist', async () => {
      const created = await createEndpoint(app, userToken);
      const endpointId: string = created.body.id;

      await request(app.getHttpServer())
        .post(
          `/v1/webhooks/${endpointId}/redeliver/00000000-0000-0000-0000-000000000000`,
        )
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });

    it('returns 400 when endpoint belongs to another user', async () => {
      const created = await createEndpoint(app, otherToken);
      const endpointId: string = created.body.id;

      await request(app.getHttpServer())
        .post(
          `/v1/webhooks/${endpointId}/redeliver/00000000-0000-0000-0000-000000000000`,
        )
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const created = await createEndpoint(app, userToken);
      const endpointId: string = created.body.id;

      await request(app.getHttpServer())
        .post(
          `/v1/webhooks/${endpointId}/redeliver/00000000-0000-0000-0000-000000000000`,
        )
        .expect(401);
    });

    it('redelivers a real delivery and returns { success: true }', async () => {
      // Seed a delivery row directly so we don't need an outbound HTTP call
      const created = await createEndpoint(app, userToken);
      const endpointId: string = created.body.id;

      const deliveryRows = await dataSource.query(
        `INSERT INTO webhook_deliveries ("endpointId", "eventType", payload, "attemptCount", "createdAt")
         VALUES ($1, $2, $3::jsonb, 0, NOW()) RETURNING id`,
        [endpointId, 'ping', JSON.stringify({ test: true })],
      );
      const deliveryId: string = deliveryRows[0].id;

      const res = await request(app.getHttpServer())
        .post(`/v1/webhooks/${endpointId}/redeliver/${deliveryId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(res.body).toEqual({ success: true });
    });
  });
});
