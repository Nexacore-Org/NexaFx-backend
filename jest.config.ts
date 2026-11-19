import type { Config } from 'jest';
import { baseConfig } from './jest.base.config';

const config: Config = {
  ...baseConfig,
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  coverageReporters: ['json-summary', 'lcov', 'html', 'text-summary'],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 75,
      branches: 70,
      statements: 80,
    },
  },
  coveragePathIgnorePatterns: [
    '\\.module\\.ts$',
    '\\.entity\\.ts$',
    'main\\.ts',
    '/migrations/',
  ],
};

export default config;
