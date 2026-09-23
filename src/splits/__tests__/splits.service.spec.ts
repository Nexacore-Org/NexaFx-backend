import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SplitsService } from '../splits.service';
import { PaymentSplit, SplitStatus } from '../entities/payment-split.entity';
import {
  PaymentSplitParticipant,
  ParticipantStatus,
} from '../entities/payment-split-participant.entity';
import { CreateSplitDto } from '../dto/create-split.dto';
import { UnprocessableEntityException } from '@nestjs/common';

class TransactionsServiceMock {
  async createTransaction(p: any): Promise<any> {
    return { id: 'tx_mock_123' };
  }
}

class UsersServiceMock {
  async findByEmail(email: string): Promise<any> {
    return email.includes('user') ? { id: 'usr_resolved' } : null;
  }
}

class NotificationServiceMock {
  async send(to: string, msg: string): Promise<void> {}
}

describe('SplitsService', () => {
  let service: SplitsService;
  let splitRepo: Repository<PaymentSplit>;
  let participantRepo: Repository<PaymentSplitParticipant>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SplitsService,
        {
          provide: getRepositoryToken(PaymentSplit),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(PaymentSplitParticipant),
          useClass: Repository,
        },
        {
          provide: 'TransactionsService',
          useClass: TransactionsServiceMock,
        },
        {
          provide: 'UsersService',
          useClass: UsersServiceMock,
        },
        {
          provide: 'NotificationService',
          useClass: NotificationServiceMock,
        },
      ],
    }).compile();

    service = module.get<SplitsService>(SplitsService);
    splitRepo = module.get<Repository<PaymentSplit>>(
      getRepositoryToken(PaymentSplit),
    );
    participantRepo = module.get<Repository<PaymentSplitParticipant>>(
      getRepositoryToken(PaymentSplitParticipant),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSplit', () => {
    it('should create a new split and auto-pay initiator share', async () => {
      const dto: CreateSplitDto = {
        title: 'Test Split',
        totalAmount: 100,
        currency: 'USD',
        participants: [
          { email: 'initiator@user.com', shareAmount: 50 },
          { email: 'participant@user.com', shareAmount: 50 },
        ],
      };

      const initiatorId = 'initiator_id';
      const initiatorEmail = 'initiator@user.com';

      const saveSpy = jest
        .spyOn(splitRepo, 'save')
        .mockResolvedValue({ id: 'split_1' } as PaymentSplit);
      jest
        .spyOn(splitRepo, 'findOne')
        .mockResolvedValue({ id: 'split_1' } as PaymentSplit);
      jest
        .spyOn(service as any, 'checkAutoCompletion')
        .mockResolvedValue(undefined);

      const result = await service.createSplit(
        initiatorId,
        initiatorEmail,
        dto,
      );

      expect(saveSpy).toHaveBeenCalled();
      expect(
        result.participants.find((p) => p.email === initiatorEmail).status,
      ).toBe(ParticipantStatus.PAID);
    });

    it('should throw an error if participant amounts do not sum to total', async () => {
      const dto: CreateSplitDto = {
        title: 'Test Split',
        totalAmount: 100,
        currency: 'USD',
        participants: [
          { email: 'initiator@user.com', shareAmount: 40 },
          { email: 'participant@user.com', shareAmount: 50 },
        ],
      };

      await expect(service.createSplit('id', 'email', dto)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });
});
