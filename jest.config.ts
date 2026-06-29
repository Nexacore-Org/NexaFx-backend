import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  
  // 1. Mandatory Issue Thresholds: Build fails if metrics drop below these bars
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 75,
      branches: 70,
      statements: 80,
    },
  },
  
  // 2. Explicit Exclusions: Omit boilerplates, modules, data models, and migrations
  coveragePathIgnorePatterns: [
    '\\.module\\.ts$',
    '\\.entity\\.ts$',
    'main\\.ts',
    '/migrations/',
  ],
};

export default config;