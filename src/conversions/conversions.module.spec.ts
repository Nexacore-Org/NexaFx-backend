import { Test, TestingModule } from '@nestjs/testing';
import { ConversionsModule } from './conversions.module';
import { ConversionsController } from './conversions.controller';
import { ConversionsService } from './conversions.service';

describe('ConversionsModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [ConversionsModule],
    }).compile();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should have ConversionsController defined', () => {
    const controller = module.get<ConversionsController>(ConversionsController);
    expect(controller).toBeDefined();
  });

  it('should have ConversionsService defined', () => {
    const service = module.get<ConversionsService>(ConversionsService);
    expect(service).toBeDefined();
  });

  it('should inject ConversionsService into ConversionsController', () => {
    const controller = module.get<ConversionsController>(ConversionsController);
    const service = module.get<ConversionsService>(ConversionsService);

    expect(controller).toBeDefined();
    expect(service).toBeDefined();
  });

  it('should have all required dependencies resolved', () => {
    expect(() => {
      module.get<ConversionsController>(ConversionsController);
      module.get<ConversionsService>(ConversionsService);
    }).not.toThrow();
  });
});
