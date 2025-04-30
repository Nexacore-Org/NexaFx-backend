import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AuditModule } from './audit.module';
import { Test } from '@nestjs/testing';
import { RolesGuard } from 'src/common/guards/roles.guard';

describe('AuditController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuditModule],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true }) // simulate ADMIN
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  it('/GET audit/logs (as ADMIN)', () => {
    return request(app.getHttpServer())
      .get('/audit/logs')
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
      });
  });

  afterAll(async () => {
    await app.close();
  });
});
