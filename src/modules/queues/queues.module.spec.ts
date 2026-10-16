import { EMAIL_QUEUE, WEBHOOK_QUEUE, TAX_QUEUE } from './queue.constants';
import { QueuesDashboardService } from './queues-dashboard.service';
import { QueuesModule } from './queues.module';

describe('QueuesModule', () => {
  const queueTokens = (): string[] => {
    const imports: unknown[] = Reflect.getMetadata('imports', QueuesModule) ?? [];
    return imports.flatMap((module) => {
      const providers = (module as { providers?: { provide?: unknown }[] })
        ?.providers;
      if (!Array.isArray(providers)) return [];
      return providers
        .map((provider) => provider?.provide)
        .filter(
          (token): token is string =>
            typeof token === 'string' && token.startsWith('BullQueue_'),
        );
    });
  };

  it('provides QueuesDashboardService', () => {
    const providers: unknown[] = Reflect.getMetadata('providers', QueuesModule);
    expect(providers).toContain(QueuesDashboardService);
  });

  it('exports the dashboard service so main.ts can mount the router', () => {
    const exports: unknown[] = Reflect.getMetadata('exports', QueuesModule);
    expect(exports).toContain(QueuesDashboardService);
  });

  it('registers the email, webhook and tax queues', () => {
    expect(queueTokens()).toEqual(
      expect.arrayContaining([
        `BullQueue_${EMAIL_QUEUE}`,
        `BullQueue_${WEBHOOK_QUEUE}`,
        `BullQueue_${TAX_QUEUE}`,
      ]),
    );
  });
});