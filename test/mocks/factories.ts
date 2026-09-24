import { Repository } from 'typeorm';

export const createMockRepository = <T = any>(
  overrides: Partial<Record<keyof Repository<T>, any>> = {},
): Partial<Record<keyof Repository<T>, jest.Mock>> => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  findOneBy: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockImplementation((entity) => entity),
  save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
  update: jest.fn().mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] }),
  delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
  count: jest.fn().mockResolvedValue(0),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
    getMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(null),
    getRawMany: jest.fn().mockResolvedValue([]),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  })),
  ...overrides,
});

export const createMockRedisClient = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(3600),
  incr: jest.fn().mockResolvedValue(1),
  ping: jest.fn().mockResolvedValue('PONG'),
  eval: jest.fn().mockResolvedValue([1, 60000]),
  quit: jest.fn().mockResolvedValue('OK'),
  disconnect: jest.fn().mockReturnValue(undefined),
  status: 'ready',
  on: jest.fn(),
});

export const createMockQueue = (name = 'default') => ({
  name,
  add: jest.fn().mockResolvedValue({ id: 'job-1', name }),
  getJobCounts: jest.fn().mockResolvedValue({
    active: 0,
    completed: 10,
    failed: 2,
    delayed: 0,
    waiting: 3,
    paused: 0,
  }),
  getFailed: jest.fn().mockResolvedValue([]),
  getCompleted: jest.fn().mockResolvedValue([]),
  getActive: jest.fn().mockResolvedValue([]),
  getWaiting: jest.fn().mockResolvedValue([]),
  retryJobs: jest.fn().mockResolvedValue(undefined),
  clean: jest.fn().mockResolvedValue(['job-old-1', 'job-old-2']),
  close: jest.fn().mockResolvedValue(undefined),
});
