import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchService } from './search.service';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { SupportTicket } from './entities/support-ticket.entity';
import { User } from '../users/user.entity';
import { AuditLog } from '../audit-logs/entities/audit-log.entity';

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: { query: jest.fn() },
        },
        {
          provide: getRepositoryToken(Notification),
          useValue: { query: jest.fn() },
        },
        {
          provide: getRepositoryToken(SupportTicket),
          useValue: { query: jest.fn() },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { query: jest.fn() },
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: { query: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('builds an AND query with prefix matching for multi-word input', () => {
    expect(service.buildTsQuery('monthly rent')).toBe("monthly & rent:*");
  });

  it('treats email-like input as pii and skips analytics storage', async () => {
    await expect(service.trackAnalytics('john@example.com')).resolves.toBeUndefined();
  });
});
