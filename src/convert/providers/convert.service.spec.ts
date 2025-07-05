import { Test, TestingModule } from '@nestjs/testing';
import { ConvertService } from '../convert.service';

describe('ConvertService', () => {
  let service: ConvertService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConvertService],
    }).compile();

    service = module.get<ConvertService>(ConvertService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
