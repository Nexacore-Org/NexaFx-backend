import { FlagsController } from './flags.controller';

describe('FlagsController', () => {
  let controller: FlagsController;
  let service: any;

  beforeEach(() => {
    service = {
      getFlagsForUser: jest.fn(),
      listFlags: jest.fn(),
      createFlag: jest.fn(),
      updateFlag: jest.fn(),
      deleteFlag: jest.fn(),
      isEnabled: jest.fn(),
    };
    controller = new FlagsController(service);
  });

  it('should call getFlagsForUser', async () => {
    service.getFlagsForUser.mockResolvedValue({ flag1: true });
    expect(await controller.getUserFlags({ user: { userId: '1' } })).toEqual({
      flag1: true,
    });
  });

  it('should call listFlags', async () => {
    service.listFlags.mockResolvedValue([]);
    expect(await controller.listFlags()).toEqual([]);
  });

  it('should call createFlag', async () => {
    service.createFlag.mockResolvedValue({});
    expect(await controller.createFlag({})).toEqual({});
  });

  it('should call updateFlag', async () => {
    service.updateFlag.mockResolvedValue({});
    expect(await controller.updateFlag('1', {})).toEqual({});
  });

  it('should call deleteFlag', async () => {
    service.deleteFlag.mockResolvedValue(undefined);
    expect(await controller.deleteFlag('1')).toEqual({ success: true });
  });

  it('should return enabled state from checkFlagForUser', async () => {
    service.listFlags.mockResolvedValue([{ id: '1', key: 'flag1' }]);
    service.isEnabled.mockResolvedValue(true);
    expect(await controller.checkFlagForUser('1', 'user1')).toEqual({
      enabled: true,
    });
  });

  it('should return enabled false if flag not found in checkFlagForUser', async () => {
    service.listFlags.mockResolvedValue([]);
    expect(await controller.checkFlagForUser('1', 'user1')).toEqual({
      enabled: false,
    });
  });
});
