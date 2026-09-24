import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';
import { BankProvider } from './entities/linked-bank-account.entity';

describe('BankAccountsController', () => {
  let controller: BankAccountsController;
  let service: jest.Mocked<BankAccountsService>;

  // Shape produced by JwtStrategy.validate()
  const req = { user: { userId: 'user-1', email: 'a@b.com' } } as unknown as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BankAccountsController],
      providers: [
        {
          provide: BankAccountsService,
          useValue: {
            initiateLink: jest.fn(),
            handleCallback: jest.fn(),
            syncBalance: jest.fn(),
            getUserAccounts: jest.fn(),
            unlinkAccount: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(BankAccountsController);
    service = module.get(BankAccountsService);
  });

  it('initiateLink passes the authenticated userId and provider', async () => {
    const out = { linkUrl: 'https://x', reference: 'ref' };
    service.initiateLink.mockResolvedValue(out);

    await expect(
      controller.initiateLink(req, BankProvider.OKRA),
    ).resolves.toBe(out);
    expect(service.initiateLink).toHaveBeenCalledWith('user-1', BankProvider.OKRA);
  });

  it('handleCallback forwards reference and code', async () => {
    service.handleCallback.mockResolvedValue({ id: 'acc-1' } as any);

    await controller.handleCallback('ref-1', 'code-1');

    expect(service.handleCallback).toHaveBeenCalledWith('ref-1', 'code-1');
  });

  it('syncBalance forwards the account id', async () => {
    service.syncBalance.mockResolvedValue({ id: 'acc-1' } as any);

    await controller.syncBalance('acc-1');

    expect(service.syncBalance).toHaveBeenCalledWith('acc-1');
  });

  it('syncBalance propagates NotFoundException', async () => {
    service.syncBalance.mockRejectedValue(new NotFoundException());

    await expect(controller.syncBalance('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('listAccounts returns accounts for the authenticated user', async () => {
    service.getUserAccounts.mockResolvedValue([]);

    await expect(controller.listAccounts(req)).resolves.toEqual([]);
    expect(service.getUserAccounts).toHaveBeenCalledWith('user-1');
  });

  it('unlinkAccount passes id and authenticated userId', async () => {
    service.unlinkAccount.mockResolvedValue({ id: 'acc-1', isActive: false } as any);

    await controller.unlinkAccount('acc-1', req);

    expect(service.unlinkAccount).toHaveBeenCalledWith('acc-1', 'user-1');
  });

  it('unlinkAccount propagates NotFoundException', async () => {
    service.unlinkAccount.mockRejectedValue(new NotFoundException());

    await expect(controller.unlinkAccount('acc-1', req)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
