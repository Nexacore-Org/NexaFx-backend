import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SupportTicketsModule } from '../support-tickets.module';
import { SupportTicket, TicketStatus } from '../entities/support-ticket.entity';
import { Role } from '../../users/enums/role.enum';

const mockJwtAuthGuard = {
  canActivate: jest.fn().mockImplementation((context) => {
    const req = context.switchToHttp().getRequest();
    req.user = { id: 'user-123' };
    return true;
  }),
};

const mockRolesGuard = {
  canActivate: jest.fn().mockImplementation((context) => {
    const req = context.switchToHttp().getRequest();
    const roles = context.getHandler().roles;
    
    // If roles include ADMIN and user is an admin, return true
    if (roles?.includes(Role.ADMIN) && req.user.roles?.includes(Role.ADMIN)) {
      return true;
    }
    
    // No roles required or user has the required role
    return !roles || roles.length === 0;
  }),
};

const mockTicket = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  userId: 'user-123',
  subject: 'Test Ticket',
  description: 'This is a test ticket',
  status: TicketStatus.OPEN,
  response: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('SupportTicketsController (e2e)', () => {
  let app: INestApplication;
  let mockRepository;

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn().mockReturnValue(mockTicket),
      save: jest.fn().mockResolvedValue(mockTicket),
      find: jest.fn().mockResolvedValue([mockTicket]),
      findOne: jest.fn().mockResolvedValue(mockTicket),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [SupportTicketsModule],
    })
      .overrideProvider(getRepositoryToken(SupportTicket))
      .useValue(mockRepository)
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/support-tickets (POST) - should create a ticket', () => {
    return request(app.getHttpServer())
      .post('/support-tickets')
      .send({
        subject: 'Test Ticket',
        description: 'This is a test ticket',
      })
      .expect(201)
      .expect((res) => {
        expect(res.body).toEqual(expect.objectContaining({
          id: expect.any(String),
          subject: 'Test Ticket',
          description: 'This is a test ticket',
        }));
      });
  });

  it('/support-tickets/my-tickets (GET) - should get user tickets', () => {
    return request(app.getHttpServer())
      .get('/support-tickets/my-tickets')
      .expect(200)
      .expect([mockTicket]);
  });

  it('/support-tickets/:id (GET) - should get a ticket as owner', () => {
    return request(app.getHttpServer())
      .get('/support-tickets/123e4567-e89b-12d3-a456-426614174000')
      .expect(200)
      .expect(mockTicket);
  });

  it('/support-tickets/:id (PATCH) - should update a ticket as admin', () => {
    // Override the mock to simulate admin role
    mockJwtAuthGuard.canActivate.mockImplementationOnce((context) => {
      const req = context.switchToHttp().getRequest();
      req.user = { id: 'admin-123', roles: [Role.ADMIN] };
      return true;
    });

    const updatedTicket = {
      ...mockTicket,
      response: 'Admin response',
      status: TicketStatus.RESPONDED,
    };
    
    mockRepository.save.mockResolvedValueOnce(updatedTicket);

    return request(app.getHttpServer())
      .patch('/support-tickets/123e4567-e89b-12d3-a456-426614174000')
      .send({
        response: 'Admin response',
      })
      .expect(200)
      .expect(updatedTicket);
  });

  it('/support-tickets (GET) - should get all tickets as admin', () => {
    // Override the mock to simulate admin role
    mockJwtAuthGuard.canActivate.mockImplementationOnce((context) => {
      const req = context.switchToHttp().getRequest();
      req.user = { id: 'admin-123', roles: [Role.ADMIN] };
      return true;
    });

    return request(app.getHttpServer())
      .get('/support-tickets')
      .expect(200)
      .expect([mockTicket]);
  });
});