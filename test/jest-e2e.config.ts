import type { Config } from 'jest';
import { baseConfig } from '../jest.base.config';

const config: Config = {
  ...baseConfig,
  rootDir: '..',
  testRegex: '.e2e-spec.ts$',
  testTimeout: 300000,
  maxWorkers: 1,
  setupFilesAfterEnv: ['<rootDir>/test/setup.e2e.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};

export default config;
