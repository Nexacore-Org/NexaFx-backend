import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import { createTestApp } from '../helpers/app.helper';
import { truncateAll, setupTestDatabase, getLatestOtp } from '../helpers/db.helper';
import { BlockchainNetwork, AddressFormatType } from '../../src/bridge-prep/entities/blockchain-network.entity';
import { ExternalWalletAddress } from '../../src/bridge-prep/entities/external-wallet-address.entity';

describe('Bridge Prep E2E', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let networkRepo: Repository<BlockchainNetwork>;
  let walletRepo: Repository<ExternalWalletAddress>;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await setupTestDatabase(dataSource);
    networkRepo = dataSource.getRepository(BlockchainNetwork);
    walletRepo = dataSource.getRepository(ExternalWalletAddress);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(dataSource);

    // Sign up a user to get an access token
    const email = 'bridge@example.com';
    await request(app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email,
        password: 'Password123!',
        firstName: 'Bridge',
        lastName: 'Tester',
        phone: '+1987654321',
      });
    const otp = await getLatestOtp(dataSource, email);
    const authRes = await request(app.getHttpServer())
      .post('/v1/auth/verify-signup-otp')
      .send({ email, otp });
    
    accessToken = authRes.body.accessToken;
  });

  describe('GET /v2/networks', () => {
    it('should require authentication', async () => {
      await request(app.getHttpServer()).get('/v2/networks').expect(401);
    });

    it('should return networks', async () => {
      await networkRepo.save({
        name: 'Stellar',
        symbol: 'XLM',
        isSupported: true,
        explorerUrl: 'https://stellar.expert',
        avgConfirmationSeconds: 5,
        addressFormat: AddressFormatType.STELLAR,
        isActive: true,
      });

      const res = await request(app.getHttpServer())
        .get('/v2/networks')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].name).toBe('Stellar');
    });
  });

  describe('GET /v2/networks/bridge-status', () => {
    it('should require authentication', async () => {
      await request(app.getHttpServer()).get('/v2/networks/bridge-status').expect(401);
    });

    it('should return live and comingSoon networks', async () => {
      await networkRepo.save([
        {
          name: 'Stellar',
          symbol: 'XLM',
          isSupported: true,
          explorerUrl: 'x',
          avgConfirmationSeconds: 5,
          addressFormat: AddressFormatType.STELLAR,
          isActive: true,
        },
        {
          name: 'Ethereum',
          symbol: 'ETH',
          isSupported: false,
          explorerUrl: 'x',
          avgConfirmationSeconds: 15,
          addressFormat: AddressFormatType.EVM,
          isActive: true,
        }
      ]);

      const res = await request(app.getHttpServer())
        .get('/v2/networks/bridge-status')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.live).toContain('Stellar');
      expect(res.body.comingSoon).toContain('Ethereum');
    });
  });

  describe('POST /v2/external-wallets', () => {
    let network: BlockchainNetwork;
    beforeEach(async () => {
      network = await networkRepo.save({
        name: 'Ethereum',
        symbol: 'ETH',
        isSupported: true,
        explorerUrl: 'x',
        avgConfirmationSeconds: 15,
        addressFormat: AddressFormatType.EVM,
        isActive: true,
      });
    });

    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer()).post('/v2/external-wallets').send({}).expect(401);
    });

    it('should return 400 for invalid address format', async () => {
      const res = await request(app.getHttpServer())
        .post('/v2/external-wallets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          networkId: network.id,
          address: 'invalid-address',
        })
        .expect(400);
      
      expect(res.body.message).toContain('Invalid hex configuration');
    });

    it('should save wallet for valid address', async () => {
      const res = await request(app.getHttpServer())
        .post('/v2/external-wallets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          networkId: network.id,
          address: '0x1234567890123456789012345678901234567890',
          label: 'My ETH Wallet',
        })
        .expect(201);
      
      expect(res.body.address).toBe('0x1234567890123456789012345678901234567890');
      expect(res.body.label).toBe('My ETH Wallet');
    });
  });

  describe('GET /v2/external-wallets', () => {
    it('should require authentication', async () => {
      await request(app.getHttpServer()).get('/v2/external-wallets').expect(401);
    });

    it('should return user wallets', async () => {
      const network = await networkRepo.save({
        name: 'Ethereum',
        symbol: 'ETH',
        isSupported: true,
        explorerUrl: 'x',
        avgConfirmationSeconds: 15,
        addressFormat: AddressFormatType.EVM,
        isActive: true,
      });

      await request(app.getHttpServer())
        .post('/v2/external-wallets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          networkId: network.id,
          address: '0x1234567890123456789012345678901234567890',
        });

      const res = await request(app.getHttpServer())
        .get('/v2/external-wallets')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].address).toBe('0x1234567890123456789012345678901234567890');
    });
  });

  describe('DELETE /v2/external-wallets/:id', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .delete('/v2/external-wallets/00000000-0000-0000-0000-000000000001')
        .expect(401);
    });

    it('should delete user wallet', async () => {
      const network = await networkRepo.save({
        name: 'Ethereum',
        symbol: 'ETH',
        isSupported: true,
        explorerUrl: 'x',
        avgConfirmationSeconds: 15,
        addressFormat: AddressFormatType.EVM,
        isActive: true,
      });

      const createRes = await request(app.getHttpServer())
        .post('/v2/external-wallets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          networkId: network.id,
          address: '0x1234567890123456789012345678901234567890',
        });
      
      const walletId = createRes.body.id;

      await request(app.getHttpServer())
        .delete(`/v2/external-wallets/${walletId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
      
      // Verify deletion
      const wallets = await walletRepo.find({ where: { id: walletId } });
      expect(wallets.length).toBe(0);
    });
  });

  describe('POST /v2/external-wallets/:id/verify', () => {
    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .post('/v2/external-wallets/00000000-0000-0000-0000-000000000001/verify')
        .expect(401);
    });

    it('should return verification challenge', async () => {
      const network = await networkRepo.save({
        name: 'Ethereum',
        symbol: 'ETH',
        isSupported: true,
        explorerUrl: 'x',
        avgConfirmationSeconds: 15,
        addressFormat: AddressFormatType.EVM,
        isActive: true,
      });

      const createRes = await request(app.getHttpServer())
        .post('/v2/external-wallets')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          networkId: network.id,
          address: '0x1234567890123456789012345678901234567890',
        });
      
      const walletId = createRes.body.id;

      const res = await request(app.getHttpServer())
        .post(`/v2/external-wallets/${walletId}/verify`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      
      expect(res.body.verificationStatus).toBe('CHALLENGE_GENERATED');
      expect(res.body.challenge).toBeDefined();
    });
  });
});
