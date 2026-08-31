import { Test, TestingModule } from '@nestjs/testing';
import { SplitsController } from '../splits.controller';
import { SplitsService } from '../splits.service';
import { CreateSplitDto } from '../dto/create-split.dto';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';

describe('SplitsController', () => {
  let controller: SplitsController;
  let service: SplitsService;

  const mockSplitsService = {
    createSplit: jest.fn(),
    payShare: jest.fn(),
    remindParticipants: jest.fn(),
    waiveShare: jest.fn(),
    cancelSplit: jest.fn(),
    getInitiated: jest.fn(),
    getIncoming: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SplitsController],
      providers: [
        {
          provide: SplitsService,
          useValue: mockSplitsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SplitsController>(SplitsController);
    service = module.get<SplitsService>(SplitsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new split', async () => {
      const dto: CreateSplitDto = {
        title: 'Test Split',
        totalAmount: 100,
        currency: 'USD',
        participants: [],
      };
      const req = { user: { id: '1', email: 'test@test.com' } };
      await controller.create(req, dto);
      expect(service.createSplit).toHaveBeenCalledWith(
        req.user.id,
        req.user.email,
        dto,
      );
    });
  });

  describe('pay', () => {
    it('should pay a share', async () => {
      const req = { user: { id: '1', email: 'test@test.com' } };
      await controller.pay('split_id', req);
      expect(service.payShare).toHaveBeenCalledWith(
        'split_id',
        req.user.id,
        req.user.email,
      );
    });
  });
});
