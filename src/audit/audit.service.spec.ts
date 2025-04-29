import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit.entity';
import { AuditService } from './audit.service';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('AuditService', () => {
  let auditService: AuditService;
  let auditRepo: Repository<AuditLog>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLog),
          useClass: Repository,
        },
      ],
    }).compile();

    auditService = moduleRef.get(AuditService);
    auditRepo = moduleRef.get(getRepositoryToken(AuditLog));
  });

  it('should log a login action', async () => {
    const spy = jest.spyOn(auditRepo, 'save').mockResolvedValueOnce({} as any);
    await auditService.logAction('user123', '127.0.0.1', 'LOGIN');
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user123',
        ipAddress: '127.0.0.1',
        action: 'LOGIN',
      }),
    );
  });

  it('should return all logs', async () => {
    const logs = [
      {
        id: '1',
        userId: 'u1',
        action: 'LOGIN',
        ipAddress: 'x',
        timestamp: new Date(),
      },
    ];
    jest.spyOn(auditRepo, 'find').mockResolvedValue(logs as any);
    const result = await auditService.findAll();
    expect(result).toEqual(logs);
  });
});
