import { Test, TestingModule } from '@nestjs/testing';
import { ActivityLogModule } from './activity-log.module';
import { ActivityLogController } from './controllers/activity-log.controller';
import { ActivityLogService } from './providers/activity-log.service';

describe('ActivityLogModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [ActivityLogModule],
    }).compile();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should have ActivityLogController defined', () => {
    const controller = module.get<ActivityLogController>(ActivityLogController);
    expect(controller).toBeDefined();
  });

  it('should have ActivityLogService defined', () => {
    const service = module.get<ActivityLogService>(ActivityLogService);
    expect(service).toBeDefined();
  });

  it('should export ActivityLogService', () => {
    const service = module.get<ActivityLogService>(ActivityLogService);
    expect(service).toBeDefined();
  });

  it('should inject ActivityLogService into ActivityLogController', () => {
    const controller = module.get<ActivityLogController>(ActivityLogController);
    const service = module.get<ActivityLogService>(ActivityLogService);
    
    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  it('should have all required dependencies resolved', () => {
    expect(() => {
      module.get<ActivityLogController>(ActivityLogController);
      module.get<ActivityLogService>(ActivityLogService);
    }).not.toThrow();
  });
}); 