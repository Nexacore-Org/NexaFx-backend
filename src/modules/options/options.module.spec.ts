// The module and service both import paths that do not exist on disk. They are
// stubbed virtually here so the wiring can be inspected; the
// "unresolvable imports" block below pins the underlying defect.
jest.mock(
  '../exchange-rates/entities/exchange-rate-snapshot.entity',
  () => ({ ExchangeRateSnapshot: class ExchangeRateSnapshot {} }),
  { virtual: true },
);
jest.mock(
  '../wallets/wallets.service',
  () => ({ WalletsService: class WalletsService {} }),
  { virtual: true },
);
jest.mock(
  '../wallets/wallets.module',
  () => ({ WalletsModule: class WalletsModule {} }),
  { virtual: true },
);

import 'reflect-metadata';
import { existsSync } from 'fs';
import { join } from 'path';
import { ScheduleModule } from '@nestjs/schedule';
import { OptionsController } from './options.controller';
import { OptionsModule } from './options.module';
import { OptionsService } from './options.service';

const { WalletsModule }: { WalletsModule: new () => object } = jest.requireMock(
  '../wallets/wallets.module',
);

const MODULE_DIR = __dirname;
const MODULES_DIR = join(MODULE_DIR, '..');
const SRC_DIR = join(MODULE_DIR, '..', '..');

describe('OptionsModule', () => {
  const metadata = (key: string): unknown[] =>
    (Reflect.getMetadata(key, OptionsModule) as unknown[]) ?? [];

  describe('wiring', () => {
    it('registers the options service', () => {
      expect(metadata('providers')).toContain(OptionsService);
    });

    it('registers the options controller', () => {
      expect(metadata('controllers')).toContain(OptionsController);
    });

    it('exports the options service', () => {
      expect(metadata('exports')).toEqual([OptionsService]);
    });

    it('imports the wallets module it settles through', () => {
      expect(metadata('imports')).toContain(WalletsModule);
    });

    it('imports ScheduleModule for the hourly settlement cron', () => {
      expect(metadata('imports')).toContain(ScheduleModule);
    });
  });

  describe('unresolvable imports (BLOCKER — see PR notes)', () => {
    // OptionsModule is registered in src/app.module.ts, so these unresolvable
    // paths fail at require time. Delete this block once the paths are fixed.
    it('imports an exchange-rate entity path that does not exist', () => {
      expect(
        existsSync(
          join(
            MODULES_DIR,
            'exchange-rates',
            'entities',
            'exchange-rate-snapshot.entity.ts',
          ),
        ),
      ).toBe(false);
    });

    it('imports wallets paths that do not exist', () => {
      expect(
        existsSync(join(MODULES_DIR, 'wallets', 'wallets.service.ts')),
      ).toBe(false);
      expect(
        existsSync(join(MODULES_DIR, 'wallets', 'wallets.module.ts')),
      ).toBe(false);
    });

    it('the real files live one directory higher, outside src/modules', () => {
      expect(
        existsSync(
          join(
            SRC_DIR,
            'exchange-rates',
            'entities',
            'exchange-rate-snapshot.entity.ts',
          ),
        ),
      ).toBe(true);
      expect(existsSync(join(SRC_DIR, 'wallets', 'wallets.service.ts'))).toBe(
        true,
      );
      expect(existsSync(join(SRC_DIR, 'wallets', 'wallets.module.ts'))).toBe(
        true,
      );
    });
  });
});
