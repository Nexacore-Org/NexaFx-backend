import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { QueuesModule } from './queues.module';
import { QueuesDashboardService } from './queues-dashboard.service';
import { QUEUE_CONNECTION_TOKEN } from './queue.constants';
import { AdminQueueAuthMiddleware } from './admin-queue-auth.middleware';

describe('QueuesModule', () => {
  let module: TestingModule;
  let queuesModule: QueuesModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ REDIS_HOST: 'localhost', REDIS_PORT: 6379 })],
        }),
        QueuesModule,
      ],
    }).compile();

    queuesModule = module.get<QueuesModule>(QueuesModule);
  });

  it('should compile the module and provide QueuesDashboardService and QUEUE_CONNECTION_TOKEN', () => {
    expect(module).toBeDefined();
    const dashboardService = module.get<QueuesDashboardService>(
      QueuesDashboardService,
    );
    const redisConn = module.get(QUEUE_CONNECTION_TOKEN);
    expect(dashboardService).toBeDefined();
    expect(redisConn).toBeDefined();
    expect(redisConn.host).toBe('localhost');
  });

  it('should configure AdminQueueAuthMiddleware for admin queues routes', () => {
    const applyMock = jest.fn().mockReturnThis();
    const forRoutesMock = jest.fn();
    applyMock.mockReturnValue({ forRoutes: forRoutesMock });

    const mockConsumer: MiddlewareConsumer = {
      apply: applyMock,
    } as unknown as MiddlewareConsumer;

    queuesModule.configure(mockConsumer);

    expect(applyMock).toHaveBeenCalledWith(AdminQueueAuthMiddleware);
    expect(forRoutesMock).toHaveBeenCalledWith({
      path: 'admin/queues*',
      method: RequestMethod.ALL,
    });
  });
});
