import { jest } from '@jest/globals';

export const mockUserRepository = () => ({
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
});

export const mockTransactionRepository = () => ({
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
});

export const mockMailService = () => ({
  sendMail: jest.fn().mockResolvedValue(true),
});

export const mockStellarService = () => ({
  submitTransaction: jest.fn().mockResolvedValue({ hash: 'mock-stellar-hash' }),
});

export const mockRedisClient = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
});