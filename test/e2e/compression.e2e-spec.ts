import { INestApplication } from '@nestjs/common';
import { Request, Response } from 'express';
import * as request from 'supertest';
import { createTestApp } from '../helpers/app.helper';

/**
 * Compression regression coverage.
 *
 * `configureApp` wires `compression({ threshold: 1024 })`, which is shared by
 * `src/main.ts` and the e2e app factory, so any response body larger than
 * 1024 bytes must come back with `Content-Encoding: gzip` and anything at or
 * below the threshold must not.
 */
describe('Response compression (e2e)', () => {
  let app: INestApplication;

  function getRawResponse(path: string) {
    return request(app.getHttpServer())
      .get(path)
      .set('Accept-Encoding', 'gzip')
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
  }

  beforeAll(async () => {
    app = await createTestApp((testApp) => {
      testApp.use('/v1/compression-fixture', (_req: Request, res: Response) => {
        res.status(200).json({ data: 'x'.repeat(2048) });
      });
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('compresses an over-threshold response with gzip', async () => {
    const response = await getRawResponse('/v1/compression-fixture');
    expect(response.status).toBe(200);

    const body: Buffer = response.body as Buffer;
    expect(body.length).toBeGreaterThan(1024);
    expect(response.headers['content-encoding']).toBe('gzip');
  });

  it('does not compress an under-threshold response', async () => {
    const response = await getRawResponse('/health');
    expect([200, 503]).toContain(response.status);

    const body: Buffer = response.body as Buffer;
    expect(body.length).toBeLessThanOrEqual(1024);
    expect(response.headers['content-encoding']).toBeUndefined();
  });
});
