import { FeatureFlagGuard } from './feature-flag.guard';
import { NotFoundException } from '@nestjs/common';

describe('FeatureFlagGuard', () => {
  let GuardClass: any;
  let guard: any;
  let flagsServiceMock: any;

  beforeEach(() => {
    flagsServiceMock = {
      isEnabled: jest.fn(),
    };
    GuardClass = FeatureFlagGuard('dao_voting');
    guard = new GuardClass(flagsServiceMock);
  });

  it('should return true if flag is enabled', async () => {
    flagsServiceMock.isEnabled.mockResolvedValue(true);
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId: 'user1' } }),
      }),
    };

    const result = await guard.canActivate(mockContext as any);
    expect(result).toBe(true);
    expect(flagsServiceMock.isEnabled).toHaveBeenCalledWith(
      'dao_voting',
      'user1',
    );
  });

  it('should return true if flag is enabled and user is undefined', async () => {
    flagsServiceMock.isEnabled.mockResolvedValue(true);
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({}), // No user
      }),
    };

    const result = await guard.canActivate(mockContext as any);
    expect(result).toBe(true);
    expect(flagsServiceMock.isEnabled).toHaveBeenCalledWith(
      'dao_voting',
      undefined,
    );
  });

  it('should throw NotFoundException if flag is disabled', async () => {
    flagsServiceMock.isEnabled.mockResolvedValue(false);
    const mockContext = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { userId: 'user1' } }),
      }),
    };

    await expect(guard.canActivate(mockContext as any)).rejects.toThrow(
      NotFoundException,
    );
  });
});
