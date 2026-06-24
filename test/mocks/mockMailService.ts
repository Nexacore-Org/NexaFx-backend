export const mockMailService = () => ({
  send: jest.fn().mockResolvedValue({ id: 'msg-123' }),
  sendBulk: jest.fn().mockResolvedValue([]),
  sendPasswordReset: jest.fn().mockResolvedValue({ id: 'msg-123' }),
  sendWelcome: jest.fn().mockResolvedValue({ id: 'msg-123' }),
});

export default mockMailService;
