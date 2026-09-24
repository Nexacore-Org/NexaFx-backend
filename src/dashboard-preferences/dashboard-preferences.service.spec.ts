import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DashboardPreferencesService } from './dashboard-preferences.service';
import { DashboardPreference } from './entities/dashboard-preference.entity';
import { DEFAULT_DASHBOARD_WIDGETS } from './dashboard-preferences.constants';

describe('DashboardPreferencesService', () => {
  let service: DashboardPreferencesService;
  let repo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };

  const USER = 'user-123';
  const existingRow = (overrides: Partial<DashboardPreference> = {}): DashboardPreference =>
    ({
      id: 'pref-1',
      userId: USER,
      layout: [
        { id: 'balance-summary', position: 0, visible: true },
        { id: 'recent-transactions', position: 1, visible: true },
      ],
      createdAt: new Date('2026-09-24T10:00:00Z'),
      updatedAt: new Date('2026-09-24T11:00:00Z'),
      ...overrides,
    }) as DashboardPreference;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) =>
        Promise.resolve({
          ...v,
          id: 'pref-1',
          createdAt: v.createdAt ?? new Date('2026-09-24T10:00:00Z'),
          updatedAt: new Date('2026-09-24T11:00:00Z'),
        }),
      ),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardPreferencesService,
        { provide: getRepositoryToken(DashboardPreference), useValue: repo },
      ],
    }).compile();

    service = module.get(DashboardPreferencesService);
  });

  describe('getPreferences', () => {
    it('returns the documented defaults for a user with no saved layout', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.getPreferences(USER);

      expect(repo.findOne).toHaveBeenCalledWith({ where: { userId: USER } });
      expect(result).toEqual({
        userId: USER,
        layout: [...DEFAULT_DASHBOARD_WIDGETS],
        isDefault: true,
      });
    });

    it('returns the saved layout when one exists', async () => {
      repo.findOne.mockResolvedValue(existingRow());

      const result = await service.getPreferences(USER);

      expect(result).toEqual({
        userId: USER,
        layout: existingRow().layout,
        isDefault: false,
        updatedAt: '2026-09-24T11:00:00.000Z',
      });
    });
  });

  describe('savePreferences', () => {
    it('inserts a new row when the user has no saved layout', async () => {
      repo.findOne.mockResolvedValue(null);

      const dto = { layout: [{ id: 'a', position: 0, visible: true }] };
      const result = await service.savePreferences(USER, dto);

      expect(repo.create).toHaveBeenCalledWith({
        userId: USER,
        layout: dto.layout,
      });
      expect(repo.save).toHaveBeenCalled();
      expect(result.isDefault).toBe(false);
    });

    it('updates the existing row when the user has a saved layout', async () => {
      const existing = existingRow();
      repo.findOne.mockResolvedValue(existing);

      const result = await service.savePreferences(USER, {
        layout: [{ id: 'notifications', position: 9, visible: false }],
      });

      expect(existing.layout).toEqual([
        { id: 'notifications', position: 9, visible: false },
      ]);
      expect(repo.save).toHaveBeenCalledWith(existing);
      expect(result.layout).toHaveLength(1);
    });

    it('collapses duplicate widget ids (last wins) and sorts by position', async () => {
      repo.findOne.mockResolvedValue(null);

      const dto = {
        layout: [
          { id: 'a', position: 5, visible: false },
          { id: 'b', position: 1, visible: true },
          { id: 'a', position: 0, visible: true },
        ],
      };
      const result = await service.savePreferences(USER, dto);

      expect(result.layout).toEqual([
        { id: 'a', position: 0, visible: true },
        { id: 'b', position: 1, visible: true },
      ]);
    });
  });

  describe('resetPreferences', () => {
    it('deletes the row and returns the defaults', async () => {
      const result = await service.resetPreferences(USER);

      expect(repo.delete).toHaveBeenCalledWith({ userId: USER });
      expect(result).toEqual({
        userId: USER,
        layout: [...DEFAULT_DASHBOARD_WIDGETS],
        isDefault: true,
      });
    });
  });
});