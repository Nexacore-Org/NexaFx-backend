export const mockNotificationPreferenceService = () => ({
  getPreference: jest.fn().mockResolvedValue({
    userId: 'user-123',
    digestMode: 'IMMEDIATE',
    push: true,
    email: true,
    inApp: true,
  }),
  isChannelEnabled: jest.fn().mockResolvedValue(true),
  updatePreference: jest.fn().mockResolvedValue({ success: true }),
});

export default mockNotificationPreferenceService;
