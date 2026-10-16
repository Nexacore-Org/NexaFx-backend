import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { createTestApp } from '../helpers/app.helper';
import {
  seedTestUser,
  setupTestDatabase,
  teardownTestDatabase,
  cleanDatabase,
} from '../helpers/db.helper';
import { FlagsService } from '../../src/modules/flags/flags.service';
import { VoteChoice } from '../../src/dao/entities/vote.entity';

/**
 * e2e coverage for the DAO governance write paths.
 *
 * Regression guard for #1305: the controller used to pass `req.user.user`
 * (which JwtStrategy never returns) into ProposalService, so both
 * POST /v1/dao/proposals and POST /v1/dao/proposals/:id/vote crashed with
 * a TypeError (500). The service now loads the User by userId itself.
 *
 * Regression guard for #1306: votes cast before `votingStartAt` must be
 * rejected with 400, and a duplicate vote for the same proposal must be
 * rejected with 409 (Conflict) rather than surfacing the unique-index
 * violation as a 500.
 *
 * Users are seeded straight into the table and a token is minted with the
 * app's own JwtService: auth.login() is an OTP flow and no longer returns
 * an access token, so driving the login endpoint here would only test the
 * auth flow rather than DAO authorization.
 */
describe('DAO governance (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let jwt: JwtService;

  let adminToken: string;
  let voterToken: string;
  let voterId: string;

  const now = () => new Date();
  const iso = (offsetMs: number) =>
    new Date(Date.now() + offsetMs).toISOString();

  const tokenFor = (user: { id: string; email: string; role: string }) =>
    jwt.sign({ sub: user.id, email: user.email, role: user.role });

  const proposalBody = (overrides: Record<string, unknown> = {}) => ({
    title: 'Increase treasury allocation',
    description: 'Allocate more XLM to the community fund.',
    votingStartAt: iso(-60 * 60 * 1000),
    votingEndAt: iso(60 * 60 * 1000),
    quorumPercent: 10,
    passThresholdPercent: 50,
    ...overrides,
  });

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    jwt = app.get(JwtService);
    await setupTestDatabase(dataSource);
  });

  afterAll(async () => {
    await app.close();
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase(dataSource);

    const flags = app.get(FlagsService);
    await flags.createFlag({
      key: 'dao_voting',
      name: 'DAO voting',
      isEnabled: true,
      rolloutPercent: 100,
      environments: ['test', 'development'],
    });

    const admin = await seedTestUser(dataSource, {
      email: 'dao-admin@example.com',
      password: 'Password123!',
      role: 'ADMIN',
    });
    const voter = await seedTestUser(dataSource, {
      email: 'dao-voter@example.com',
      password: 'Password123!',
      role: 'USER',
    });
    voterId = voter.id;

    // castVote derives vote weight from the voter's XLM balance.
    await dataSource
      .getRepository('users')
      .update({ id: voterId }, { balances: { XLM: 100 } } as never);

    adminToken = tokenFor({
      id: admin.id,
      email: admin.email,
      role: 'ADMIN',
    });
    voterToken = tokenFor({
      id: voter.id,
      email: voter.email,
      role: 'USER',
    });
  });

  describe('POST /v1/dao/proposals', () => {
    it('lets an admin create a proposal (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/dao/proposals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(proposalBody())
        .expect(201);

      const body = res.body?.data ?? res.body;
      expect(body).toHaveProperty('id');
      expect(body.title).toBe('Increase treasury allocation');
    });

    it('rejects a non-admin creating a proposal (403)', async () => {
      await request(app.getHttpServer())
        .post('/v1/dao/proposals')
        .set('Authorization', `Bearer ${voterToken}`)
        .send(proposalBody({ title: 'Unauthorized proposal' }))
        .expect(403);
    });

    it('rejects a proposal missing required fields (400)', async () => {
      await request(app.getHttpServer())
        .post('/v1/dao/proposals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Incomplete' })
        .expect(400);
    });

    it('rejects an unauthenticated request (401)', async () => {
      await request(app.getHttpServer())
        .post('/v1/dao/proposals')
        .send(proposalBody())
        .expect(401);
    });
  });

  describe('POST /v1/dao/proposals/:id/vote', () => {
    const createProposal = async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/dao/proposals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(proposalBody({ title: `Fund the docs sprint ${now().getTime()}` }))
        .expect(201);
      return (res.body?.data ?? res.body).id as string;
    };

    it('lets a user with an XLM balance cast a vote (201)', async () => {
      const proposalId = await createProposal();

      const res = await request(app.getHttpServer())
        .post(`/v1/dao/proposals/${proposalId}/vote`)
        .set('Authorization', `Bearer ${voterToken}`)
        .send({ choice: VoteChoice.YES })
        .expect(201);

      expect(res.body?.data ?? res.body).toBeDefined();
    });

    it('rejects a vote cast before votingStartAt (400)', async () => {
      const proposalId = await createProposal();

      await dataSource
        .getRepository('proposals')
        .update(
          { id: proposalId },
          { votingStartAt: new Date(Date.now() + 60 * 60 * 1000) } as never,
        );

      await request(app.getHttpServer())
        .post(`/v1/dao/proposals/${proposalId}/vote`)
        .set('Authorization', `Bearer ${voterToken}`)
        .send({ choice: VoteChoice.YES })
        .expect(400);
    });

    it('rejects a duplicate vote for the same proposal (409)', async () => {
      const proposalId = await createProposal();

      await request(app.getHttpServer())
        .post(`/v1/dao/proposals/${proposalId}/vote`)
        .set('Authorization', `Bearer ${voterToken}`)
        .send({ choice: VoteChoice.YES })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/v1/dao/proposals/${proposalId}/vote`)
        .set('Authorization', `Bearer ${voterToken}`)
        .send({ choice: VoteChoice.NO })
        .expect(409);
    });

    it('rejects a vote on an unknown proposal (404)', async () => {
      await request(app.getHttpServer())
        .post('/v1/dao/proposals/00000000-0000-4000-8000-000000000000/vote')
        .set('Authorization', `Bearer ${voterToken}`)
        .send({ choice: VoteChoice.YES })
        .expect(404);
    });
  });
});