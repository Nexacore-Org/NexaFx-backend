const mockArchiver = jest.fn(() => ({
  append: jest.fn(),
  finalize: jest.fn(),
  pipe: jest.fn(),
  on: jest.fn(),
}));

export default mockArchiver;
