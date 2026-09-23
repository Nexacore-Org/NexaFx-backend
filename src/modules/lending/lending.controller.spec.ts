import { Test, TestingModule } from '@nestjs/testing';
import { LendingController } from './lending.controller';
import { LendingService } from './lending.service';

describe('LendingController', () => {
  let controller: LendingController;
  let service: Record<string, jest.Mock>;

  beforeEach(async () => {
    service = {
      listOffers: jest.fn().mockResolvedValue([]),
      createOffer: jest.fn().mockResolvedValue({ id: 'o1' }),
      acceptOffer: jest.fn().mockResolvedValue({ id: 'a1' }),
      repayLoan: jest.fn().mockResolvedValue({ id: 'a1', status: 'REPAID' }),
      getMyOffers: jest.fn().mockResolvedValue([]),
      getMyAgreements: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LendingController],
      providers: [{ provide: LendingService, useValue: service }],
    }).compile();

    controller = module.get(LendingController);
  });

  it('listOffers forwards query filters', async () => {
    await controller.listOffers(0.15, 50, 60);
    expect(service.listOffers).toHaveBeenCalledWith({
      maxRate: 0.15,
      minAmount: 50,
      maxTerm: 60,
    });
  });

  it('createOffer uses authenticated user id', async () => {
    const dto = {
      amount: '10',
      annualInterestRate: '0.1',
      termDays: 30,
    };
    await controller.createOffer({ user: { id: 'u1' } }, dto);
    expect(service.createOffer).toHaveBeenCalledWith('u1', dto);
  });

  it('acceptOffer uses route id and user id', async () => {
    await controller.acceptOffer('offer-9', { user: { id: 'b1' } });
    expect(service.acceptOffer).toHaveBeenCalledWith('offer-9', 'b1');
  });

  it('repayLoan delegates to service', async () => {
    await controller.repayLoan('agr-1');
    expect(service.repayLoan).toHaveBeenCalledWith('agr-1');
  });

  it('getMyOffers and getMyAgreements use req.user.id', async () => {
    await controller.getMyOffers({ user: { id: 'u2' } });
    await controller.getMyAgreements({ user: { id: 'u2' } });
    expect(service.getMyOffers).toHaveBeenCalledWith('u2');
    expect(service.getMyAgreements).toHaveBeenCalledWith('u2');
  });
});
