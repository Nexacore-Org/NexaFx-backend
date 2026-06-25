export const mockFirebaseService = () => ({
  sendMessage: jest.fn().mockResolvedValue('msg-123'),
  sendMulticast: jest.fn().mockResolvedValue({ successCount: 1, failureCount: 0 }),
  sendToTopic: jest.fn().mockResolvedValue('msg-123'),
  subscribeToTopic: jest.fn().mockResolvedValue({}),
  unsubscribeFromTopic: jest.fn().mockResolvedValue({}),
  verifyIdToken: jest.fn().mockResolvedValue({ uid: 'user-123' }),
});

export default mockFirebaseService;
