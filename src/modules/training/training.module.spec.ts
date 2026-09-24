import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StaffTrainingModule } from './training.module';
import { TrainingService } from './training.service';
import { TrainingController } from './training.controller';
import { TrainingModule } from './entities/training-module.entity';
import { StaffTrainingRecord } from './entities/staff-training-record.entity';

describe('StaffTrainingModule', () => {
  let module: TestingModule;

  const mockRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [StaffTrainingModule],
    })
      .overrideProvider(getRepositoryToken(TrainingModule))
      .useValue(mockRepository)
      .overrideProvider(getRepositoryToken(StaffTrainingRecord))
      .useValue(mockRepository)
      .compile();
  });

  afterAll(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide TrainingService', () => {
    const service = module.get<TrainingService>(TrainingService);
    expect(service).toBeDefined();
  });

  it('should have TrainingController', () => {
    const controller = module.get<TrainingController>(TrainingController);
    expect(controller).toBeDefined();
  });

  it('should export TrainingService', () => {
    const service = module.get<TrainingService>(TrainingService);
    expect(service).toBeInstanceOf(TrainingService);
  });
});
