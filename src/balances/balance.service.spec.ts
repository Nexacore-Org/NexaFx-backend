import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BalanceService } from './balance.service';

describe('BalanceService', () => {
  let query: jest.Mock;
  let service: BalanceService;

  beforeEach(() => {
    query = jest.fn();
    service = new BalanceService({ query } as unknown as DataSource);
  });

  describe('isSufficient', () => {
    it('compares exactly, without binary float error', () => {
      // 0.1 + 0.2 !== 0.3 in floats; as decimals the balance covers it.
      expect(BalanceService.isSufficient('0.3', '0.30000000')).toBe(true);
      expect(BalanceService.isSufficient('0.29999999', '0.3')).toBe(false);
      expect(BalanceService.isSufficient('100', 100)).toBe(true);
    });
  });

  describe('debit', () => {
    it('sends the amount as a decimal string and returns the new balance', async () => {
      query.mockResolvedValueOnce([[{ balance: '40.00000000' }], 1]);

      const balance = await service.debit('u1', 'XLM', '60');

      expect(balance).toBe('40');
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('>= $3::numeric');
      expect(params).toEqual(['u1', 'XLM', '60']);
    });

    it('throws Insufficient balance when the guarded UPDATE touches no row', async () => {
      query
        .mockResolvedValueOnce([[], 0]) // UPDATE matched nothing
        .mockResolvedValueOnce([{ '?column?': 1 }]); // but the user exists

      await expect(service.debit('u1', 'XLM', '60')).rejects.toThrow(
        new BadRequestException('Insufficient balance'),
      );
    });

    it('throws NotFound when the user does not exist', async () => {
      query.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([]);

      await expect(service.debit('missing', 'XLM', '1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it.each([['0'], ['-1'], [NaN], [Infinity]])(
      'rejects the invalid amount %p before touching the database',
      async (amount) => {
        await expect(service.debit('u1', 'XLM', amount)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(query).not.toHaveBeenCalled();
      },
    );
  });

  describe('credit', () => {
    it('credits with a single statement and returns the new balance', async () => {
      query.mockResolvedValueOnce([[{ balance: '5.1' }], 1]);

      await expect(service.credit('u1', 'USD', '0.1')).resolves.toBe('5.1');
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][1]).toEqual(['u1', 'USD', '0.1']);
    });

    it('throws NotFound when no row was updated', async () => {
      query.mockResolvedValueOnce([[], 0]);

      await expect(
        service.credit('missing', 'USD', '1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('uses the supplied transactional manager instead of the data source', async () => {
      const manager = {
        query: jest.fn().mockResolvedValue([[{ balance: '1' }], 1]),
      };

      await service.credit('u1', 'USD', '1', manager);

      expect(manager.query).toHaveBeenCalledTimes(1);
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('getBalance', () => {
    it('reads the balance as text and defaults a missing currency to 0', async () => {
      query.mockResolvedValueOnce([{ balance: '0' }]);

      await expect(service.getBalance('u1', 'EUR')).resolves.toBe('0');
    });

    it('throws NotFound for an unknown user', async () => {
      query.mockResolvedValueOnce([]);

      await expect(service.getBalance('missing', 'XLM')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('applyDelta', () => {
    it('routes positive deltas to credit and negative deltas to a guarded debit', async () => {
      query.mockResolvedValue([[{ balance: '1' }], 1]);

      await service.applyDelta('u1', 'XLM', '5');
      expect(query.mock.calls[0][0]).not.toContain('>= $3::numeric');

      await service.applyDelta('u1', 'XLM', '-5');
      expect(query.mock.calls[1][0]).toContain('>= $3::numeric');
      expect(query.mock.calls[1][1]).toEqual(['u1', 'XLM', '5']);
    });

    it('treats a zero delta as a read', async () => {
      query.mockResolvedValueOnce([{ balance: '7' }]);

      await expect(service.applyDelta('u1', 'XLM', 0)).resolves.toBe('7');
    });
  });
});
