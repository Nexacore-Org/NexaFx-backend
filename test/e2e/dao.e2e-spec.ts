import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { UserRole } from '../../src/auth/enums/user-role.enum';
import { AuthService } from '../../src/auth/services/auth.service';
import { UserService } from '../../src/users/services/user.service';
import { ProposalStatus } from '../../src/dao/enums/proposal-status.enum';

/**
 * e2e coverage for the DAO governance write paths.
 *
 * Regression guard for #1305: the controller used to pass `req.user.user`
 * (which JwtStrategy never returns) into ProposalService, so both
 * POST /dao/proposals and POST /dao/proposals/:id/vote crashed with a
 * TypeError (500). The service now loads the User by userId itself.
 *
 * Regression guard for #1306: votes cast before `votingStartAt` must be
 * rejected with 400, and a duplicate vote for the same proposal must be
 * rejected with 409 (Conflict) rather than surfacing the unique-index
 * violation as a 500.
 */
describe('DAO governance (e2e)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let userService: UserService;

  let adminToken: string;
  let voterToken: string;
  let voterId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    authService = app.get(AuthService);
    userService = app.get(UserService);

    const admin = await userService.create({
      email: 'dao-admin@example.com',
      password: 'Password123!',
      role: UserRole.ADMIN,
    });
    const voter = await userService.create({
      email: 'dao-voter@example.com',
      password: 'Password123!',
      role: UserRole.USER,
    });
    voterId = voter.id;

    // Give the voter an XLM balance so castVote's balance lookup succeeds.
    await userService.update(voterId, {
      balances: { XLM: 100 },
    } as any);

    adminToken = (
      await authService.login({
        email: 'dao-admin@example.com',
        password: 'Password123!',
      })
    ).accessToken;
    voterToken = (
      await authService.login({
        email: 'dao-voter@example.com',
        password: 'Password123!',
      })
    ).accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /dao/proposals', () => {
    it('lets an admin create a proposal (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/dao/proposals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Increase treasury allocation',
          description: 'Allocate more XLM to the community fund.',
          status: ProposalStatus.ACTIVE,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toBe('Increase treasury allocation');
    });

    it('rejects a non-admin creating a proposal (403)', async () => {
      await request(app.getHttpServer())
        .post('/dao/proposals')
        .set('Authorization', `Bearer ${voterToken}`)
        .send({
          title: 'Unauthorized proposal',
          description: 'Should not be allowed.',
        })
        .expect(403);
    });
  });

  describe('POST /dao/proposals/:id/vote', () => {
    it('lets a user with an XLM balance cast a vote (201)', async () => {
      const created = await request(app.getHttpServer())
        .post('/dao/proposals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Fund the docs sprint',
          description: 'Allocate XLM to documentation work.',
          status: ProposalStatus.ACTIVE,
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/dao/proposals/${created.body.id}/vote`)
        .set('Authorization', `Bearer ${voterToken}`)
        .send({ choice: 'for' })
        .expect(201);

      expect(res.body).toBeDefined();
    });

    it('rejects a vote cast before votingStartAt (400)', async () => {
      const futureStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const created = await request(app.getHttpServer())
        .post('/dao/proposals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Future proposal',
          description: 'Voting has not opened yet.',
          status: ProposalStatus.ACTIVE,
          votingStartAt: futureStart,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/dao/proposals/${created.body.id}/vote`)
        .set('Authorization', `Bearer ${voterToken}`)
        .send({ choice: 'for' })
        .expect(400);
    });

    it('rejects a duplicate vote for the same proposal (409)', async () => {
      const created = await request(app.getHttpServer())
        .post('/dao/proposals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Duplicate vote guard',
          description: 'Only one vote per voter is allowed.',
          status: ProposalStatus.ACTIVE,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/dao/proposals/${created.body.id}/vote`)
        .set('Authorization', `Bearer ${voterToken}`)
        .send({ choice: 'for' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/dao/proposals/${created.body.id}/vote`)
        .set('Authorization', `Bearer ${voterToken}`)
        .send({ choice: 'against' })
        .expect(409);
    });
  });
});
