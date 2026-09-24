import { DashboardPreferencesController } from './dashboard-preferences.controller';
import { DashboardPreferencesService } from './dashboard-preferences.service';
import { DEFAULT_DASHBOARD_WIDGETS } from './dashboard-preferences.constants';

describe('DashboardPreferencesController', () => {
  let controller: DashboardPreferencesController;
  let service: {
    getPreferences: jest.Mock;
    savePreferences: jest.Mock;
    resetPreferences: jest.Mock;
  };

  const user = { userId: 'user-123', email: 'u@example.com', role: 'USER' };

  beforeEach(() => {
    service = {
      getPreferences: jest.fn(),
      savePreferences: jest.fn(),
      resetPreferences: jest.fn(),
    } as unknown as DashboardPreferencesService;

    controller = new DashboardPreferencesController(
      service as unknown as DashboardPreferencesService,
    );
  });

  it('gets preferences for the authenticated user', async () => {
    service.getPreferences.mockResolvedValue({
      userId: user.userId,
      layout: [...DEFAULT_DASHBOARD_WIDGETS],
      isDefault: true,
    });

    const result = await controller.get(user as any);

    expect(service.getPreferences).toHaveBeenCalledWith('user-123');
    expect(result.layout).toHaveLength(DEFAULT_DASHBOARD_WIDGETS.length);
  });

  it('saves preferences scoped to the authenticated user', async () => {
    const dto = { layout: [{ id: 'a', position: 0, visible: true }] };
    service.savePreferences.mockResolvedValue({ ...dto, userId: user.userId, isDefault: false });

    const result = await controller.save(user as any, dto as any);

    expect(service.savePreferences).toHaveBeenCalledWith('user-123', dto);
    expect(result.isDefault).toBe(false);
  });

  it('resets preferences for the authenticated user', async () => {
    service.resetPreferences.mockResolvedValue({
      userId: user.userId,
      layout: [...DEFAULT_DASHBOARD_WIDGETS],
      isDefault: true,
    });

    const result = await controller.reset(user as any);

    expect(service.resetPreferences).toHaveBeenCalledWith('user-123');
    expect(result.isDefault).toBe(true);
  });
});