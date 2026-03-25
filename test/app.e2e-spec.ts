import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { api, createE2eApp } from './helpers/e2e-app';

describe('App Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createE2eApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the root health payload', async () => {
    const response = await api(app).get('/').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.service).toBe('NexaFX API');
  });
});
