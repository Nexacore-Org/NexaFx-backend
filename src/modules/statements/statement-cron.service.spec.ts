import { Test, TestingModule } from '@nestjs/testing';
import { StatementCronService } from './statement-cron.service';
import { StatementService } from './statement.service';

// Prevent loading the real StatementService's transitively-heavy dependency chain.
jest.mock('../../wallets/wallets.service', () => ({
  WalletsService: class {},
}));
jest.mock('../../users/users.service', () => ({ UsersService: class {} }));
jest.mock('../../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));

describe('StatementCronService', () => {
  let service: StatementCronService;
  let statementService: any;

  beforeEach(async () => {
    statementService = {
      generateForAllActiveUsers: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatementCronService,
        { provide: StatementService, useValue: statementService },
      ],
    }).compile();

    service = module.get<StatementCronService>(StatementCronService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('generates statements for the previous calendar month', async () => {
    jest.useFakeTimers();
    // 2026-03-15 -> previous month is February 2026 (index 2).
    jest.setSystemTime(new Date('2026-03-15T00:00:00Z'));

    await service.handleMonthlyStatementGeneration();

    expect(statementService.generateForAllActiveUsers).toHaveBeenCalledWith(
      2026,
      2,
    );
  });

  it('rolls the previous month back through December across a year boundary', async () => {
    jest.useFakeTimers();
    // 2026-01-10 -> previous month is December 2025 (index 12).
    jest.setSystemTime(new Date('2026-01-10T00:00:00Z'));

    await service.handleMonthlyStatementGeneration();

    expect(statementService.generateForAllActiveUsers).toHaveBeenCalledWith(
      2025,
      12,
    );
  });

  it('skips generation when a run is already in progress', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-15T00:00:00Z'));
    (service as any).isRunning = true;

    await service.handleMonthlyStatementGeneration();

    expect(statementService.generateForAllActiveUsers).not.toHaveBeenCalled();
  });

  it('logs and swallows errors without throwing', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-15T00:00:00Z'));
    statementService.generateForAllActiveUsers.mockRejectedValue(
      new Error('db down'),
    );

    await expect(
      service.handleMonthlyStatementGeneration(),
    ).resolves.toBeUndefined();
  });

  it('resets the running flag after a run completes', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-15T00:00:00Z'));

    await service.handleMonthlyStatementGeneration();

    expect((service as any).isRunning).toBe(false);
  });
});
