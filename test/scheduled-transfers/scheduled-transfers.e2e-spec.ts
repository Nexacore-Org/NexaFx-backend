/**
 * test/scheduled-transfers/scheduled-transfers.e2e-spec.ts
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScheduledTransferEntity, ScheduledTransferStatus } from '../../src/scheduled-transfers/entities/scheduled-transfer.entity';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';

describe('ScheduledTransfersController (e2e)', () => {
  let app: INestApplication;
  let scheduledTransferRepository: Repository<ScheduledTransferEntity>;
  let jwtService: JwtService;
  let authToken: string;
  const testUserId = '12345678-1234-1234-1234-123456789012';
  
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    scheduledTransferRepository = app.get(getRepositoryToken(ScheduledTransferEntity));
    jwtService = app.get(JwtService);
    
    // Create test auth token
    authToken = jwtService.sign({ id: testUserId, email: 'test@example.com' });
    
    // Clean up database before tests
    await scheduledTransferRepository.delete({});
  });

  afterAll(async () => {
    // Clean up database after tests
    await scheduledTransferRepository.delete({});
    await app.close();
  });

  describe('/scheduled-transfers (POST)', () => {
    it('should create a scheduled transfer', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1); // tomorrow
      
      const createDto = {
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        amount: 100,
        scheduledAt: futureDate.toISOString(),
      };
      
      const response = await request(app.getHttpServer())
        .post('/scheduled-transfers')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createDto)
        .expect(201);
      
      expect(response.body).toHaveProperty('id');
      expect(response.body.userId).toBe(testUserId);
      expect(response.body.fromCurrency).toBe(createDto.fromCurrency);
      expect(response.body.toCurrency).toBe(createDto.toCurrency);
      expect(response.body.amount).toBe(createDto.amount);
      expect(response.body.status).toBe(ScheduledTransferStatus.PENDING);
      expect(response.body.executedAt).toBeNull();
    });
    
    it('should reject a transfer with a past date', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // yesterday
      
      const createDto = {
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        amount: 100,
        scheduledAt: pastDate.toISOString(),
      };
      
      const response = await request(app.getHttpServer())
        .post('/scheduled-transfers')
        .set('Authorization', `Bearer ${authToken}`)
        .send(createDto)
        .expect(400);
      
      expect(response.body.message).toContain('scheduledAt must be a future date');
    });
  });
  
  describe('/scheduled-transfers/me (GET)', () => {
    beforeEach(async () => {
      // Clean up and create test data
      await scheduledTransferRepository.delete({});
      
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      
      await scheduledTransferRepository.save([
        {
          userId: testUserId,
          fromCurrency: 'USD',
          toCurrency: 'EUR',
          amount: 100,
          scheduledAt: futureDate,
          status: ScheduledTransferStatus.PENDING,
          executedAt: null,
        },
        {
          userId: testUserId,
          fromCurrency: 'EUR',
          toCurrency: 'GBP',
          amount: 200,
          scheduledAt: futureDate,
          status: ScheduledTransferStatus.PENDING,
          executedAt: null,
        },
        {
          userId: 'other-user-id',
          fromCurrency: 'JPY',
          toCurrency: 'USD',
          amount: 5000,
          scheduledAt: futureDate,
          status: ScheduledTransferStatus.PENDING,
          executedAt: null,
        },
      ]);
    });
    
    it('should return only the authenticated user\'s transfers', async () => {
      const response = await request(app.getHttpServer())
        .get('/scheduled-transfers/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      expect(response.body).toHaveLength(2);
      expect(response.body[0].userId).toBe(testUserId);
      expect(response.body[1].userId).toBe(testUserId);
    });
  });
  
  describe('/scheduled-transfers/:id (DELETE)', () => {
    let transferId: string;
    
    beforeEach(async () => {
      // Clean up and create test data
      await scheduledTransferRepository.delete({});
      
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      
      const transfer = await scheduledTransferRepository.save({
        userId: testUserId,
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        amount: 100,
        scheduledAt: futureDate,
        status: ScheduledTransferStatus.PENDING,
        executedAt: null,
      });
      
      transferId = transfer.id;
      
      // Also save a transfer that's already executed
      await scheduledTransferRepository.save({
        userId: testUserId,
        fromCurrency: 'GBP',
        toCurrency: 'USD',
        amount: 50,
        scheduledAt: futureDate,
        status: ScheduledTransferStatus.EXECUTED,
        executedAt: new Date(),
      });
      
      // And a transfer belonging to another user
      await scheduledTransferRepository.save({
        userId: 'other-user-id',
        fromCurrency: 'JPY',
        toCurrency: 'USD',
        amount: 5000,
        scheduledAt: futureDate,
        status: ScheduledTransferStatus.PENDING,
        executedAt: null,
      });
    });
    
    it('should delete a pending transfer owned by the user', async () => {
      await request(app.getHttpServer())
        .delete(`/scheduled-transfers/${transferId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      
      // Verify transfer is deleted
      const transfer = await scheduledTransferRepository.findOne({ where: { id: transferId } });
      expect(transfer).toBeNull();
    });
    
    it('should fail to delete a transfer that has already been executed', async () => {
      const executedTransfer = await scheduledTransferRepository.findOne({ 
        where: { 
          userId: testUserId,
          status: ScheduledTransferStatus.EXECUTED 
        } 
      });
      
      await request(app.getHttpServer())
        .delete(`/scheduled-transfers/${executedTransfer.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
    
    it('should fail to delete a transfer owned by another user', async () => {
      const otherUserTransfer = await scheduledTransferRepository.findOne({ 
        where: { userId: 'other-user-id' } 
      });
      
      await request(app.getHttpServer())
        .delete(`/scheduled-transfers/${otherUserTransfer.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);
    });
    
    it('should return 404 for a non-existent transfer', async () => {
      await request(app.getHttpServer())
        .delete('/scheduled-transfers/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });
});