import type { Config } from 'jest';
import { join } from 'path';

export const baseConfig: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        diagnostics: false,
        tsconfig: { allowJs: true },
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@noble|@scure|@stellar|uint8array-extras|uuid)/)',
  ],
  moduleNameMapper: {
    '^src/(.*)$': join(__dirname, 'src', '$1'),
    '^archiver$': join(__dirname, 'test', 'mocks', 'archiver.mock.ts'),
    '^uuid$': join(__dirname, 'test', 'mocks', 'uuid.ts'),
  },
};
