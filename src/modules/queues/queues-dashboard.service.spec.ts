import { NotFoundException } from '@nestjs/common';
import {
  QueuesDashboardService,
  IQueueInstance,
} from './queues-dashboard.service';

describe('QueuesDashboardService', () => {
  let service: QueuesDashboardService;

  beforeEach(() => {
    service = new QueuesDashboardService();
  });

  const createMockQueue = (name: string): IQueueInstance => ({
    name,
    getJobCounts: jest.fn().mockResolvedValue({
      active: 2,
      completed: 150,
      failed: 3,
      delayed: 1,
      waiting: 5,
      paused: 0,
    }),
    isPaused: jest.fn().mockResolvedValue(false),
    getFailed: jest.fn().mockResolvedValue([
      {
        id: 'job-101',
        name: 'send-email',
        failedReason: 'SMTP connection timeout',
        attemptsMade: 3,
        timestamp: 1700000000000,
      },
    ]),
    retryJobs: jest.fn().mockResolvedValue(undefined),
    clean: jest.fn().mockResolvedValue(['job-1', 'job-2']),
  });

  it('should register and list queue names', () => {
    const queue1 = createMockQueue('transactions');
    const queue2 = createMockQueue('notifications');

    service.registerQueue('transactions', queue1);
    service.registerQueue('notifications', queue2);

    expect(service.getRegisteredQueueNames()).toEqual([
      'transactions',
      'notifications',
    ]);
  });

  it('should unregister a queue', () => {
    const queue = createMockQueue('emails');
    service.registerQueue('emails', queue);

    expect(service.unregisterQueue('emails')).toBe(true);
    expect(service.getRegisteredQueueNames()).toEqual([]);
  });

  it('should correctly report the real state (job counts, failed jobs) of a live-registered queue', async () => {
    const queue = createMockQueue('transactions');
    service.registerQueue('transactions', queue);

    const report = await service.getQueueState('transactions');

    expect(report.name).toBe('transactions');
    expect(report.isPaused).toBe(false);
    expect(report.counts).toEqual({
      active: 2,
      completed: 150,
      failed: 3,
      delayed: 1,
      waiting: 5,
      paused: 0,
    });
    expect(report.recentFailedJobs).toHaveLength(1);
    expect(report.recentFailedJobs![0].id).toBe('job-101');
    expect(report.recentFailedJobs![0].failedReason).toBe('SMTP connection timeout');
  });

  it('should throw NotFoundException when requesting state for an unregistered queue', async () => {
    await expect(service.getQueueState('unknown-queue')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should report state for all registered queues simultaneously', async () => {
    const queue1 = createMockQueue('q1');
    const queue2 = createMockQueue('q2');

    service.registerQueue('q1', queue1);
    service.registerQueue('q2', queue2);

    const allState = await service.getAllQueuesState();

    expect(allState['q1']).toBeDefined();
    expect(allState['q2']).toBeDefined();
    expect(allState['q1'].name).toBe('q1');
    expect(allState['q2'].name).toBe('q2');
  });

  it('should call retryJobs on registered queue', async () => {
    const queue = createMockQueue('transactions');
    service.registerQueue('transactions', queue);

    await service.retryFailedJobs('transactions');
    expect(queue.retryJobs).toHaveBeenCalled();
  });

  it('should clean queue and return cleaned job ids', async () => {
    const queue = createMockQueue('transactions');
    service.registerQueue('transactions', queue);

    const cleaned = await service.cleanQueue('transactions', 3600000, 'completed');
    expect(cleaned).toEqual(['job-1', 'job-2']);
    expect(queue.clean).toHaveBeenCalledWith(3600000, 1000, 'completed');
  });
});
