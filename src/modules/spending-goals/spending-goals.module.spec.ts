import { MODULE_METADATA } from '@nestjs/common/constants';
import { SpendingGoalsModule } from './spending-goals.module';
import { SpendingGoalsController } from './spending-goals.controller';
import { SpendingGoalsService } from './spending-goals.service';
import { NotificationsModule } from '../../notifications/notifications.module';
import { MicroSavingsModule } from '../micro-savings/micro-savings.module';

jest.mock('../../notifications/notifications.module', () => ({
  NotificationsModule: class NotificationsModule {},
}));
jest.mock('../micro-savings/micro-savings.module', () => ({
  MicroSavingsModule: class MicroSavingsModule {},
}));
jest.mock('./spending-goals.service', () => ({
  SpendingGoalsService: class SpendingGoalsService {},
}));

describe('SpendingGoalsModule', () => {
  const meta = (key: string) =>
    Reflect.getMetadata(key, SpendingGoalsModule) as unknown[];

  it('registers the controller and service', () => {
    expect(meta(MODULE_METADATA.CONTROLLERS)).toEqual([SpendingGoalsController]);
    expect(meta(MODULE_METADATA.PROVIDERS)).toEqual([SpendingGoalsService]);
  });

  it('exports the service for other modules', () => {
    expect(meta(MODULE_METADATA.EXPORTS)).toEqual([SpendingGoalsService]);
  });

  it('imports the modules the service depends on', () => {
    const imports = meta(MODULE_METADATA.IMPORTS);
    expect(imports).toContain(NotificationsModule);
    expect(imports).toContain(MicroSavingsModule);
    // plus TypeOrmModule.forFeature([SpendingGoal])
    expect(imports).toHaveLength(3);
  });
});
