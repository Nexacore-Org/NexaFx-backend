export const mockUserRepository = () => ({
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
});

export default mockUserRepository;
