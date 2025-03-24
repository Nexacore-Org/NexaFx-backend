import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from '../src/user/user.module';
import { User } from '../src/user/entities/user.entity';
import { AccountType } from '../src/user/entities/user.entity';
import { AppModule } from '../src/app.module';

describe('UserController (e2e)', () => {
    let app: INestApplication;
    let moduleFixture: TestingModule;

    const testUser = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        accountType: AccountType.PERSONAL,
        password: 'Password123!',
        dateOfBirth: '1990-01-01',
        phoneNumber: '1234567890',
        address: '123 Main St',
        profilePicture: 'profile.jpg',
        bio: 'Test bio',
    };

    beforeAll(async () => {
        moduleFixture = await Test.createTestingModule({
            imports: [
                AppModule,
                TypeOrmModule.forRoot({
                    type: 'postgres',
                    host: process.env.DB_HOST || 'localhost',
                    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 5432,
                    username: process.env.DB_USERNAME || 'postgres',
                    password: process.env.DB_PASSWORD || 'postgres',
                    database: process.env.DB_NAME || 'test_db',
                    entities: [User],
                    synchronize: true,
                    dropSchema: true,
                }),
                UserModule,
            ],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('POST /users', () => {
        it('should create a new user', () => {
            return request(app.getHttpServer())
                .post('/users')
                .send(testUser)
                .expect(201)
                .expect((res) => {
                    expect(res.body).toHaveProperty('id');
                    expect(res.body.firstName).toBe(testUser.firstName);
                    expect(res.body.lastName).toBe(testUser.lastName);
                    expect(res.body.email).toBe(testUser.email);
                    expect(res.body.accountType).toBe(testUser.accountType);
                    expect(res.body.password).toBeUndefined();
                    expect(res.body.dateOfBirth).toBe(testUser.dateOfBirth);
                    expect(res.body.phoneNumber).toBe(testUser.phoneNumber);
                    expect(res.body.address).toBe(testUser.address);
                    expect(res.body.profilePicture).toBe(testUser.profilePicture);
                    expect(res.body.bio).toBe(testUser.bio);
                    expect(res.body).toHaveProperty('createdAt');
                    expect(res.body).toHaveProperty('updatedAt');
                });
        });

        it('should fail with invalid email format', () => {
            return request(app.getHttpServer())
                .post('/users')
                .send({ ...testUser, email: 'invalid-email' })
                .expect(400);
        });

        it('should fail with weak password', () => {
            return request(app.getHttpServer())
                .post('/users')
                .send({ ...testUser, password: 'weak' })
                .expect(400);
        });

        it('should fail when email already exists', async () => {
            await request(app.getHttpServer())
                .post('/users')
                .send(testUser)
                .expect(201);

            return request(app.getHttpServer())
                .post('/users')
                .send(testUser)
                .expect(409);
        });
    });

    describe('GET /users', () => {
        it('should return all users', async () => {
            const response = await request(app.getHttpServer())
                .get('/users')
                .expect(200);

            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0]).toHaveProperty('id');
            expect(response.body[0].password).toBeUndefined();
        });
    });

    describe('GET /users/:id', () => {
        let userId: string;

        beforeEach(async () => {
            const response = await request(app.getHttpServer())
                .post('/users')
                .send(testUser)
                .expect(201);
            userId = response.body.id;
        });

        it('should return a user by id', () => {
            return request(app.getHttpServer())
                .get(`/users/${userId}`)
                .expect(200)
                .expect((res) => {
                    expect(res.body.id).toBe(userId);
                    expect(res.body.password).toBeUndefined();
                });
        });

        it('should return 404 for non-existent user', () => {
            return request(app.getHttpServer())
                .get('/users/123e4567-e89b-12d3-a456-426614174000')
                .expect(404);
        });
    });

    describe('PATCH /users/:id', () => {
        let userId: string;

        beforeEach(async () => {
            const response = await request(app.getHttpServer())
                .post('/users')
                .send(testUser)
                .expect(201);
            userId = response.body.id;
        });

        it('should update a user', () => {
            const updateData = {
                firstName: 'Jane',
                password: 'NewPassword123!',
            };

            return request(app.getHttpServer())
                .patch(`/users/${userId}`)
                .send(updateData)
                .expect(200)
                .expect((res) => {
                    expect(res.body.firstName).toBe(updateData.firstName);
                    expect(res.body.password).toBeUndefined();
                });
        });

        it('should return 404 for non-existent user', () => {
            return request(app.getHttpServer())
                .patch('/users/123e4567-e89b-12d3-a456-426614174000')
                .send({ firstName: 'Jane' })
                .expect(404);
        });
    });

    describe('DELETE /users/:id', () => {
        let userId: string;

        beforeEach(async () => {
            const response = await request(app.getHttpServer())
                .post('/users')
                .send(testUser)
                .expect(201);
            userId = response.body.id;
        });

        it('should delete a user', () => {
            return request(app.getHttpServer())
                .delete(`/users/${userId}`)
                .expect(200);
        });

        it('should return 404 for non-existent user', () => {
            return request(app.getHttpServer())
                .delete('/users/123e4567-e89b-12d3-a456-426614174000')
                .expect(404);
        });
    });
}); 