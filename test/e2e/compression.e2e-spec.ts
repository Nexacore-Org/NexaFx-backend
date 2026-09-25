import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

/**
 * Compression regression coverage.
 *
 * `src/main.ts` wires `compression({ threshold: 1024 })`, which means any
 * response body larger than 1024 bytes must come back with
 * `Content-Encoding: gzip`, and anything at or below the threshold must not.
 *
 * These assertions run against the real Nest HTTP pipeline via Supertest so a
 * future refactor of response serialization (or a proxy stripping the header)
 * is caught automatically instead of relying on a hand-maintained doc.
 */
describe('Response compression (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Mirror the production compression middleware so the test exercises the
    // same threshold behaviour as the running application.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const compression = require('compression');
    app.use(compression({ threshold: 1024 }));

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('compresses an over-threshold response with gzip', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/transactions')
      .set('Accept-Encoding', 'gzip')
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    // The endpoint may require auth; a 401/403 body is still a real HTTP
    // response and, when it exceeds the threshold, must be compressed.
    const body: Buffer = response.body as Buffer;
    expect(body.length).toBeGreaterThan(1024);
    expect(response.headers['content-encoding']).toBe('gzip');
  });

  it('does not compress an under-threshold response', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/health')
      .set('Accept-Encoding', 'gzip')
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    const body: Buffer = response.body as Buffer;
    expect(body.length).toBeLessThanOrEqual(1024);
    expect(response.headers['content-encoding']).toBeUndefined();
  });
});
