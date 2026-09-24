import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { MicroSavingsService } from './micro-savings.service';
import { MicroSavingsRule, MicroSavingsTriggerType } from './entities/micro-savings-rule.entity';
import { MicroSavingsContribution } from './entities/micro-savings-contribution.entity';
import { VaultsService } from '../../vaults/vaults.service';
import { UsersService } from '../../users/users.service';
import { CreateMicroSavingsRuleDto } from './dto/micro-savings.dto';

describe('MicroSavingsService', () => {
  let service: MicroSavingsService;
  let ruleRepo: Record<string, jest.Mock>;
  let contributionRepo: Record<string, jest.Mock>;
  let vaultsService: Record<string, jest.Mock>;
  let usersService: Record<string, jest.Mock>;

  const userId = 'user-1';
  const vaultId = 'vault-1';

  const activeRule = (overrides: Partial<MicroSavingsRule> = {}): MicroSavingsRule =>
    ({
      id: 'rule-1',
      userId,
      targetVaultId: vaultId,
      isActive: true,
      triggerType: MicroSavingsTriggerType.PER_TRANSACTION,
      saveAmount: '1.00000000',
      perTransactionConfig: { minTransactionAmount: 5, savePercent: 10 },
      balanceThresholdConfig: null,
      maxDailyContribution: '50.00000000',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as MicroSavingsRule;

  beforeEach(async () => {
    ruleRepo = {
      create: jest.fn((x) => ({ id: 'rule-1', isActive: true, ...x })),
      save: jest.fn(async (x) => x),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    contributionRepo = {
      create: jest.fn((x) => ({ id: 'contrib-1', ...x })),
      save: jest.fn(async (x) => x),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '0' }),
      })),
    };
    vaultsService = {
      deposit: jest.fn().mockResolvedValue(undefined),
    };
    usersService = {
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MicroSavingsService,
        { provide: getRepositoryToken(MicroSavingsRule), useValue: ruleRepo },
        { provide: getRepositoryToken(MicroSavingsContribution), useValue: contributionRepo },
        { provide: VaultsService, useValue: vaultsService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get(MicroSavingsService);
  });

  describe('createRule', () => {
    it('persists a rule from the DTO', async () => {
      const dto: CreateMicroSavingsRuleDto = {
        targetVaultId: vaultId,
        triggerType: MicroSavingsTriggerType.PER_TRANSACTION,
        saveAmount: 1,
        maxDailyContribution: 50,
        perTransactionConfig: { minTransactionAmount: 5, savePercent: 10 },
      };

      const rule = await service.createRule(userId, dto);

      expect(ruleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          targetVaultId: vaultId,
          saveAmount: '1',
          maxDailyContribution: '50',
        }),
      );
      expect(ruleRepo.save).toHaveBeenCalled();
      expect(rule.targetVaultId).toBe(vaultId);
    });
  });

  describe('evaluatePerTransaction', () => {
    it('triggers a contribution for a qualifying transaction using percent of amount', async () => {
      const rule = activeRule();
      ruleRepo.find.mockResolvedValue([rule]);
      // today total 0 via default query builder

      await service.evaluatePerTransaction(userId, 'tx-100', 40, 'USD');

      // 10% of 40 = 4
      const expected = new Decimal(40).mul(10).div(100);
      expect(vaultsService.deposit).toHaveBeenCalledWith(
        userId,
        vaultId,
        expect.any(Number),
      );
      const deposited = vaultsService.deposit.mock.calls[0][2] as number;
      expect(new Decimal(deposited).toFixed(8)).toBe(expected.toFixed(8));

      expect(contributionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleId: rule.id,
          userId,
          vaultId,
          triggerType: 'PER_TRANSACTION',
          sourceTransactionId: 'tx-100',
        }),
      );
      const recordedAmount = contributionRepo.create.mock.calls[0][0].amount;
      expect(new Decimal(recordedAmount).toFixed(8)).toBe(expected.toFixed(8));
    });

    it('skips when transaction is below minTransactionAmount', async () => {
      ruleRepo.find.mockResolvedValue([
        activeRule({ perTransactionConfig: { minTransactionAmount: 100, savePercent: 10 } }),
      ]);

      await service.evaluatePerTransaction(userId, 'tx-1', 20, 'USD');

      expect(vaultsService.deposit).not.toHaveBeenCalled();
      expect(contributionRepo.save).not.toHaveBeenCalled();
    });

    it('caps contribution at remaining daily max', async () => {
      ruleRepo.find.mockResolvedValue([
        activeRule({
          saveAmount: '10',
          perTransactionConfig: null,
          maxDailyContribution: '15',
        }),
      ]);
      contributionRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '12' }),
      });

      await service.evaluatePerTransaction(userId, 'tx-2', 100, 'USD');

      const deposited = vaultsService.deposit.mock.calls[0][2] as number;
      // remaining = 15 - 12 = 3
      expect(new Decimal(deposited).toFixed(8)).toBe(new Decimal(3).toFixed(8));
    });

    it('skips when daily cap is already exhausted', async () => {
      ruleRepo.find.mockResolvedValue([activeRule()]);
      contributionRepo.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '50' }),
      });

      await service.evaluatePerTransaction(userId, 'tx-3', 100, 'USD');
      expect(vaultsService.deposit).not.toHaveBeenCalled();
    });

    it('does not contribute when rule is inactive (not returned by active query)', async () => {
      ruleRepo.find.mockResolvedValue([]); // only isActive:true rules are fetched

      await service.evaluatePerTransaction(userId, 'tx-4', 50, 'USD');
      expect(vaultsService.deposit).not.toHaveBeenCalled();
    });
  });

  describe('updateRule / deactivation', () => {
    it('deactivating a rule stops future contributions without deleting history', async () => {
      const rule = activeRule({ isActive: true });
      ruleRepo.findOne.mockResolvedValue({ ...rule });
      // prior contribution remains in contributionRepo — findAndCount still returns it
      const priorContribution = {
        id: 'contrib-old',
        ruleId: rule.id,
        userId,
        amount: '2.50000000',
        triggerType: 'PER_TRANSACTION',
      };
      contributionRepo.findAndCount.mockResolvedValue([[priorContribution], 1]);

      const updated = await service.updateRule(userId, rule.id, { isActive: false });
      expect(updated.isActive).toBe(false);
      expect(ruleRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));

      // After deactivation, evaluate only queries isActive: true → empty
      ruleRepo.find.mockResolvedValue([]);
      await service.evaluatePerTransaction(userId, 'tx-after-deactivate', 80, 'USD');
      expect(vaultsService.deposit).not.toHaveBeenCalled();

      // History still returns previously recorded contributions
      const history = await service.getHistory(userId);
      expect(history.total).toBe(1);
      expect(history.contributions[0].id).toBe('contrib-old');
      expect(new Decimal(history.contributions[0].amount).toFixed(8)).toBe(
        new Decimal('2.5').toFixed(8),
      );
    });

    it('throws NotFoundException for unknown rule', async () => {
      ruleRepo.findOne.mockResolvedValue(null);
      await expect(service.updateRule(userId, 'missing', { isActive: false })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteRule', () => {
    it('removes an owned rule', async () => {
      ruleRepo.findOne.mockResolvedValue(activeRule());
      await service.deleteRule(userId, 'rule-1');
      expect(ruleRepo.remove).toHaveBeenCalled();
    });

    it('throws when rule is missing', async () => {
      ruleRepo.findOne.mockResolvedValue(null);
      await expect(service.deleteRule(userId, 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('evaluateBalanceThreshold', () => {
    it('saves fixed amount when balance exceeds threshold', async () => {
      ruleRepo.find.mockResolvedValue([
        activeRule({
          triggerType: MicroSavingsTriggerType.BALANCE_THRESHOLD,
          saveAmount: '5',
          balanceThresholdConfig: { thresholdAmount: 100, saveExcess: false },
          perTransactionConfig: null,
        }),
      ]);
      usersService.findById.mockResolvedValue({
        balances: { USD: 150 },
      });

      await service.evaluateBalanceThreshold(userId, 'USD');

      const deposited = vaultsService.deposit.mock.calls[0][2] as number;
      expect(new Decimal(deposited).toFixed(8)).toBe(new Decimal(5).toFixed(8));
    });

    it('skips when balance is at or below threshold', async () => {
      ruleRepo.find.mockResolvedValue([
        activeRule({
          triggerType: MicroSavingsTriggerType.BALANCE_THRESHOLD,
          balanceThresholdConfig: { thresholdAmount: 100 },
        }),
      ]);
      usersService.findById.mockResolvedValue({ balances: { USD: 50 } });

      await service.evaluateBalanceThreshold(userId, 'USD');
      expect(vaultsService.deposit).not.toHaveBeenCalled();
    });
  });
});
