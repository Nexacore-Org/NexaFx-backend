import { BullModule } from '@nestjs/bullmq';
import {
  INestApplication,
  RequestMethod,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
  VERSION_METADATA,
} from '@nestjs/common/constants';
import { ConfigModule } from '@nestjs/config';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { APP_GUARD, APP_INTERCEPTOR, DiscoveryService } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { readFileSync } from 'fs';
import { I18nModule } from 'nestjs-i18n';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AdminModule } from '../../src/admin/admin.module';
import { AuditLogsModule } from '../../src/audit-logs/audit-logs.module';
import { AuthModule } from '../../src/auth/auth.module';
import { BeneficiariesModule } from '../../src/beneficiaries/beneficiaries.module';
import { CardsModule } from '../../src/cards/cards.module';
import { CommonModule } from '../../src/common/common.module';
import { ImpersonationRestrictionGuard } from '../../src/common/guards/impersonation-restriction.guard';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { PlanThrottlerGuard } from '../../src/common/guards/plan-throttler.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { AuditInterceptor } from '../../src/common/interceptors/audit.interceptor';
import { CurrenciesModule } from '../../src/currencies/currencies.module';
import { CustomReportsModule } from '../../src/custom-reports/custom-reports.module';
import { DaoModule } from '../../src/dao/dao.module';
import { EscrowModule } from '../../src/escrow/escrow.module';
import { ExchangeRatesModule } from '../../src/exchange-rates/exchange-rates.module';
import { RateComparisonModule } from '../../src/exchange-rates/rate-comparison.module';
import { FeesModule } from '../../src/fees/fees.module';
import { FinancialHealthModule } from '../../src/financial-health/financial-health.module';
import { FirebaseModule } from '../../src/firebase/firebase.module';
import { FlagsModule } from '../../src/modules/flags/flags.module';
import { GatewaysModule } from '../../src/gateways/gateways.module';
import { GraphQLApiModule } from '../../src/graphql/graphql.module';
import { HealthModule } from '../../src/health/health.module';
import { KycModule } from '../../src/kyc/kyc.module';
import { LedgerModule } from '../../src/ledger/ledger.module';
import { NotificationsModule } from '../../src/notifications/notifications.module';
import { PortfolioModule } from '../../src/portfolio/portfolio.module';
import { PushNotificationsModule } from '../../src/push-notifications/push-notifications.module';
import { QrModule } from '../../src/qr/qr.module';
import { RateAlertsModule } from '../../src/rate-alerts/rate-alerts.module';
import { ReceiptsModule } from '../../src/receipts/receipts.module';
import { ReferralsModule } from '../../src/referrals/referrals.module';
import { ScheduledJobsModule } from '../../src/scheduled-jobs/scheduled-jobs.module';
import { SuperAdminModule } from '../../src/super-admin/super-admin.module';
import { MaintenanceGuard } from '../../src/super-admin/guards/maintenance.guard';
import { TaxModule } from '../../src/tax/tax.module';
import { TransactionsModule } from '../../src/transactions/transaction.module';
import { TransactionsV2Module } from '../../src/transactions/transaction-v2.module';
import { UnifiedActivityFeedModule } from '../../src/unified-activity-feed/unified-activity-feed.module';
import { UsersModule } from '../../src/users/users.module';
import { WalletsModule } from '../../src/wallets/wallets.module';
import { WebhooksModule } from '../../src/webhooks/webhooks.module';
import { createTestApp } from '../helpers/app.helper';

interface RouterLayer {
  route?: { path?: string | string[]; methods?: Record<string, boolean> };
  handle?: { stack?: RouterLayer[] };
  path?: string;
}

interface HttpInstanceWithRouter {
  _router?: { stack?: RouterLayer[] };
  router?: { stack?: RouterLayer[] };
}

interface ModuleRefShape {
  metatype: unknown;
  imports: Set<{ metatype: unknown }>;
}

const expectedAppModuleImports = [
  ConfigModule,
  ScheduleModule,
  TypeOrmModule,
  BullModule,
  ThrottlerModule,
  FlagsModule,
  TaxModule,
  UnifiedActivityFeedModule,
  I18nModule,
  CommonModule,
  AuthModule,
  CurrenciesModule,
  ExchangeRatesModule,
  RateComparisonModule,
  GatewaysModule,
  HealthModule,
  AuditLogsModule,
  NotificationsModule,
  FirebaseModule,
  TransactionsModule,
  TransactionsV2Module,
  ReferralsModule,
  BeneficiariesModule,
  KycModule,
  ScheduledJobsModule,
  ReceiptsModule,
  FeesModule,
  PushNotificationsModule,
  QrModule,
  RateAlertsModule,
  AdminModule,
  SuperAdminModule,
  EscrowModule,
  DaoModule,
  CardsModule,
  GraphQLApiModule,
  WebhooksModule,
  WalletsModule,
  LedgerModule,
  UsersModule,
  PortfolioModule,
  FinancialHealthModule,
  CustomReportsModule,
];

const addLeadingSlash = (path: string): string =>
  path.startsWith('/') ? path : `/${path}`;

const stripEndSlash = (path: string): string =>
  path.endsWith('/') ? path.slice(0, -1) : path;

const toArray = (value: unknown): string[] => {
  if (value === undefined || value === null || value === '') {
    return ['/'];
  }

  return (Array.isArray(value) ? value : [value]).map((item) =>
    String(item),
  );
};

const versionPrefixes = (
  controllerVersion: unknown,
  methodVersion: unknown,
): string[] => {
  const version = methodVersion ?? controllerVersion;
  if (!version) {
    return [''];
  }

  return toArray(version).map((item) =>
    item === String(VERSION_NEUTRAL) || item === 'Symbol(VERSION_NEUTRAL)'
      ? ''
      : `/v${item.replace(/^\//, '')}`,
  );
};

const joinPaths = (parts: string[]): string[] =>
  parts
    .reduce<string[]>(
      (paths, part) =>
        part
          ? paths.flatMap((path) =>
              toArray(part).map((fragment) =>
                stripEndSlash(path) + addLeadingSlash(fragment),
              ),
            )
          : paths,
      [''],
    )
    .map((path) => stripEndSlash(addLeadingSlash(path)) || '/');

const collectMiddlewareMounts = (
  instance: HttpInstanceWithRouter,
): string[] => {
  const mounts: string[] = [];
  const visit = (layers: RouterLayer[] | undefined): void => {
    for (const layer of layers ?? []) {
      if (!layer.route && layer.path) {
        mounts.push(stripEndSlash(addLeadingSlash(layer.path)));
      }
      visit(layer.handle?.stack);
    }
  };

  visit(instance._router?.stack ?? instance.router?.stack);
  return mounts;
};

const collectRoutes = (app: INestApplication): string[] => {
  const discovery = app.get(DiscoveryService);
  const routes: string[] = [];

  for (const wrapper of discovery.getControllers()) {
    const controller = wrapper.metatype as
      | { prototype: Record<string, unknown> }
      | undefined;
    if (!controller) {
      continue;
    }

    const controllerPath = Reflect.getMetadata(PATH_METADATA, controller);
    const controllerVersion = Reflect.getMetadata(VERSION_METADATA, controller);
    const prototype = controller.prototype;

    for (const methodName of Object.getOwnPropertyNames(prototype)) {
      const handler = prototype[methodName] as object;
      const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler);
      if (requestMethod === undefined) {
        continue;
      }

      const methodLabel = RequestMethod[requestMethod as RequestMethod];
      const methodVersion = Reflect.getMetadata(VERSION_METADATA, handler);
      const versions = versionPrefixes(controllerVersion, methodVersion);

      for (const version of versions) {
        for (const path of joinPaths([
          version,
          toArray(controllerPath)[0],
          ...toArray(Reflect.getMetadata(PATH_METADATA, handler)),
        ])) {
          routes.push(`${methodLabel} ${path}`);
        }
      }
    }
  }

  const instance = app.getHttpAdapter().getInstance() as HttpInstanceWithRouter;
  let hasGraphql = false;
  try {
    app.get(GraphQLSchemaHost);
    hasGraphql = true;
  } catch {
    hasGraphql = false;
  }
  if (hasGraphql || collectMiddlewareMounts(instance).includes('/graphql')) {
    routes.push('POST /graphql');
  }

  return routes.sort();
};

describe('AppModule boot (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  }, 180000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('boots with an initialized DataSource and migrations-managed schema', () => {
    const dataSource = app.get(DataSource);

    expect(dataSource.isInitialized).toBe(true);
    expect((dataSource.options as { synchronize?: boolean }).synchronize).toBe(
      false,
    );
  });

  it('keeps every AppModule import registered', () => {
    const discovery = app.get(DiscoveryService) as unknown as {
      getModules(): ModuleRefShape[];
    };
    const appModule = discovery
      .getModules()
      .find((module) => module.metatype === AppModule);

    expect(appModule).toBeDefined();
    if (!appModule) {
      throw new Error('AppModule is not registered');
    }

    const importedModules = [...appModule.imports].map(
      (module) => module.metatype,
    );
    expect(importedModules).toHaveLength(expectedAppModuleImports.length);
    expect(new Set(importedModules)).toEqual(new Set(expectedAppModuleImports));
  });

  it('registers every required global guard and the audit interceptor', () => {
    const guards = app.get(APP_GUARD, { each: true }) as unknown[];
    const interceptors = app.get(APP_INTERCEPTOR, { each: true }) as unknown[];

    for (const guard of [
      MaintenanceGuard,
      JwtAuthGuard,
      RolesGuard,
      ImpersonationRestrictionGuard,
      PlanThrottlerGuard,
    ]) {
      expect(guards).toContainEqual(expect.any(guard));
    }
    expect(
      guards.findIndex((guard) => guard instanceof JwtAuthGuard),
    ).toBeLessThan(
      guards.findIndex(
        (guard) => guard instanceof ImpersonationRestrictionGuard,
      ),
    );
    expect(interceptors).toContainEqual(expect.any(AuditInterceptor));
  });

  it('keeps the committed HTTP route inventory intact', () => {
    const snapshot = JSON.parse(
      readFileSync(
        join(__dirname, '..', '__snapshots__', 'routes.json'),
        'utf8',
      ),
    ) as { routes: string[] };

    expect(collectRoutes(app)).toEqual(snapshot.routes.slice().sort());
  });
});
