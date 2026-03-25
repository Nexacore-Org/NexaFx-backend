import { INestApplication } from '@nestjs/common';
import { generateKeyPairSync } from 'crypto';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { api, createE2eApp, signupAndVerifyUser } from './helpers/e2e-app';

describe('Evidence Packages (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    process.env.COMPLIANCE_EVIDENCE_SIGNING_PRIVATE_KEY = privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();

    ({ app } = await createE2eApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates, lists, downloads, and verifies signed evidence packages', async () => {
    const { accessToken } = await signupAndVerifyUser(app);
    const client = api(app);

    const createResponse = await client
      .post('/v1/compliance/evidence/package')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    expect(createResponse.body.data.jobId).toBeDefined();

    let packageRecord: any;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const listResponse = await client
        .get('/v1/compliance/evidence/packages')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      packageRecord = listResponse.body.data.find(
        (item: any) => item.id === createResponse.body.data.jobId,
      );

      if (packageRecord?.status === 'READY') {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(packageRecord.status).toBe('READY');
    expect(packageRecord.downloadLink).toContain(
      `/v1/compliance/evidence/packages/${packageRecord.id}/download`,
    );

    const downloadResponse = await client
      .get(`/v1/compliance/evidence/packages/${packageRecord.id}/download`)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(downloadResponse.headers['content-type']).toContain('application/zip');

    const zip = await JSZip.loadAsync(downloadResponse.body);
    const manifestJson = await zip.file('manifest.json')?.async('string');
    const manifestSig = await zip.file('manifest.sig')?.async('string');

    expect(manifestJson).toBeDefined();
    expect(manifestSig).toBeDefined();

    const verifyResponse = await client
      .get(`/v1/compliance/evidence/${packageRecord.id}/verify`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(verifyResponse.body.data.status).toBe('VALID');
    expect(verifyResponse.body.data.chainOfCustody.requestedBy).toBeDefined();
    expect(verifyResponse.body.data.chainOfCustody.documentCount).toBeGreaterThan(0);
  });
});
