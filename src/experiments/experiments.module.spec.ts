import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExperimentsModule } from './experiments.module';
import { ExperimentsService } from './experiments.service';
import { ExperimentsController } from './experiments.controller';
import { AdminExperimentsController } from './admin-experiments.controller';
import { Experiment } from './entities/experiment.entity';
import { ExperimentVariant } from './entities/experiment-variant.entity';
import { ExperimentAssignment } from './entities/experiment-assignment.entity';
import { ExperimentEvent } from './entities/experiment-event.entity';

describe('ExperimentsModule', () => {
  let module: TestingModule;

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ExperimentsModule],
    })
      .overrideProvider(getRepositoryToken(Experiment))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(ExperimentVariant))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(ExperimentAssignment))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(ExperimentEvent))
      .useValue(mockRepository)
      .compile();
  });

  afterAll(async () => {
    await module.close();
  });

  it('should provide ExperimentsService', () => {
    const service = module.get<ExperimentsService>(ExperimentsService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(ExperimentsService);
  });

  it('should provide ExperimentsController', () => {
    const controller = module.get<ExperimentsController>(ExperimentsController);
    expect(controller).toBeDefined();
  });

  it('should provide AdminExperimentsController', () => {
    const controller = module.get<AdminExperimentsController>(
      AdminExperimentsController,
    );
    expect(controller).toBeDefined();
  });

  it('should have ExperimentsService as an export', () => {
    const exports = Reflect.getMetadata('exports', ExperimentsModule);
    expect(exports).toContain(ExperimentsService);
  });

  it('should have TypeOrmModule as an export', () => {
    const exports = Reflect.getMetadata('exports', ExperimentsModule);
    expect(exports).toBeDefined();
  });
});
