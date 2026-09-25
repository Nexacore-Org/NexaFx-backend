import { Test, TestingModule } from '@nestjs/testing';
import { Keypair, TransactionBuilder, Server } from '@stellar/stellar-sdk';
import { StellarService } from './stellar.service';

const mockServer = {
  loadAccount: jest.fn(),
  fetchBaseFee: jest.fn(),
  submitTransaction: jest.fn(),
};

jest.mock('@stellar/stellar-sdk', () => ({
  Server: jest.fn(() => mockServer),
  Keypair: { fromSecret: jest.fn() },
  TransactionBuilder: jest.fn(),
  TimeoutInfinite: 0,
}));

describe('StellarService', () => {
  let service: StellarService;
  let builders: Array<{
    addOperation: jest.Mock;
    setTimeout: jest.Mock;
    build: jest.Mock;
    tx: { sign: jest.Mock };
  }>;

  const keypairFor = (secret: string) => ({
    publicKey: () => `G_${secret}`,
  });

  const badSeqError = () =>
    Object.assign(new Error('Request failed with status code 400'), {
      response: {
        data: { extras: { result_codes: { transaction: 'tx_bad_seq' } } },
      },
    });

  const deferred = <T>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  };

  const flush = () => new Promise((r) => setImmediate(r));

  beforeEach(async () => {
    delete process.env.STELLAR_HORIZON_URL;
    delete process.env.STELLAR_NETWORK_PASSPHRASE;

    builders = [];
    (TransactionBuilder as unknown as jest.Mock).mockImplementation(() => {
      const tx = { sign: jest.fn() };
      const builder = {
        addOperation: jest.fn(),
        setTimeout: jest.fn(),
        build: jest.fn(() => tx),
        tx,
      };
      builders.push(builder);
      return builder;
    });
    (Keypair.fromSecret as jest.Mock).mockImplementation(keypairFor);

    mockServer.loadAccount.mockImplementation(async (pk: string) => ({
      accountId: pk,
    }));
    mockServer.fetchBaseFee.mockResolvedValue(100);
    mockServer.submitTransaction.mockResolvedValue({ hash: 'abc', successful: true });

    // Skip the real 1s back-off between tx_bad_seq retries.
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout);

    const module: TestingModule = await Test.createTestingModule({
      providers: [StellarService],
    }).compile();

    service = module.get(StellarService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('defaults to the public testnet Horizon URL', () => {
      expect(Server).toHaveBeenCalledWith('https://horizon-testnet.stellar.org');
    });

    it('uses STELLAR_HORIZON_URL when set', async () => {
      process.env.STELLAR_HORIZON_URL = 'https://horizon.example.org';
      await Test.createTestingModule({ providers: [StellarService] }).compile();

      expect(Server).toHaveBeenLastCalledWith('https://horizon.example.org');
    });
  });

  describe('buildAndSubmit', () => {
    const ops = [{ type: 'payment' }, { type: 'manageData' }] as any[];

    it('loads a fresh account, builds, signs and submits the transaction', async () => {
      const result = await service.buildAndSubmit('SECRET1', ops);

      expect(Keypair.fromSecret).toHaveBeenCalledWith('SECRET1');
      expect(mockServer.loadAccount).toHaveBeenCalledWith('G_SECRET1');
      expect(TransactionBuilder).toHaveBeenCalledWith(
        { accountId: 'G_SECRET1' },
        { fee: 100, networkPassphrase: 'Test SDF Network ; July 2015' },
      );

      const [b] = builders;
      expect(b.addOperation.mock.calls).toEqual([[ops[0]], [ops[1]]]);
      expect(b.setTimeout).toHaveBeenCalledWith(0);
      expect(b.tx.sign).toHaveBeenCalledWith(
        expect.objectContaining({ publicKey: expect.any(Function) }),
      );
      expect(mockServer.submitTransaction).toHaveBeenCalledWith(b.tx);
      expect(result).toEqual({ hash: 'abc', successful: true });
    });

    it('uses STELLAR_NETWORK_PASSPHRASE when set', async () => {
      process.env.STELLAR_NETWORK_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

      await service.buildAndSubmit('SECRET1', ops);

      expect(TransactionBuilder).toHaveBeenCalledWith(expect.anything(), {
        fee: 100,
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      });
    });

    it('rejects an invalid secret before any network call', async () => {
      (Keypair.fromSecret as jest.Mock).mockImplementation(() => {
        throw new Error('invalid encoded string');
      });

      await expect(service.buildAndSubmit('bad', ops)).rejects.toThrow(
        'invalid encoded string',
      );
      expect(mockServer.loadAccount).not.toHaveBeenCalled();
    });

    it('rethrows non-sequence errors without retrying', async () => {
      const err = Object.assign(new Error('underfunded'), {
        response: {
          data: { extras: { result_codes: { transaction: 'tx_failed' } } },
        },
      });
      mockServer.submitTransaction.mockRejectedValueOnce(err);

      await expect(service.buildAndSubmit('SECRET1', ops)).rejects.toBe(err);
      expect(mockServer.submitTransaction).toHaveBeenCalledTimes(1);
      expect(setTimeout).not.toHaveBeenCalled();
    });

    it('rethrows errors raised while loading the account', async () => {
      mockServer.loadAccount.mockRejectedValueOnce(new Error('Not Found'));

      await expect(service.buildAndSubmit('SECRET1', ops)).rejects.toThrow('Not Found');
      expect(mockServer.submitTransaction).not.toHaveBeenCalled();
    });

    it('retries on tx_bad_seq with a fresh sequence number and then succeeds', async () => {
      mockServer.submitTransaction
        .mockRejectedValueOnce(badSeqError())
        .mockResolvedValueOnce({ hash: 'retry-ok' });

      const result = await service.buildAndSubmit('SECRET1', ops);

      expect(result).toEqual({ hash: 'retry-ok' });
      expect(mockServer.loadAccount).toHaveBeenCalledTimes(2);
      expect(mockServer.submitTransaction).toHaveBeenCalledTimes(2);
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
    });

    it('gives up after maxRetries tx_bad_seq failures', async () => {
      const err = badSeqError();
      mockServer.submitTransaction.mockRejectedValue(err);

      await expect(service.buildAndSubmit('SECRET1', ops, 0, 2)).rejects.toBe(err);
      // 1 initial attempt + 2 retries
      expect(mockServer.submitTransaction).toHaveBeenCalledTimes(3);
    });

    it('releases the wallet lock after a failure so later submissions proceed', async () => {
      mockServer.submitTransaction.mockRejectedValueOnce(new Error('boom'));
      await expect(service.buildAndSubmit('SECRET1', ops)).rejects.toThrow('boom');

      await expect(service.buildAndSubmit('SECRET1', ops)).resolves.toEqual({
        hash: 'abc',
        successful: true,
      });
    });

    it('serializes concurrent submissions from the same wallet', async () => {
      const first = deferred<any>();
      mockServer.submitTransaction
        .mockImplementationOnce(() => first.promise)
        .mockResolvedValueOnce({ hash: 'second' });

      const p1 = service.buildAndSubmit('SECRET1', ops);
      const p2 = service.buildAndSubmit('SECRET1', ops);
      await flush();

      // Second call must not read the sequence number until the first submits.
      expect(mockServer.loadAccount).toHaveBeenCalledTimes(1);

      first.resolve({ hash: 'first' });
      await expect(p1).resolves.toEqual({ hash: 'first' });
      await expect(p2).resolves.toEqual({ hash: 'second' });
      expect(mockServer.loadAccount).toHaveBeenCalledTimes(2);
    });

    it('does not block submissions from different wallets', async () => {
      const first = deferred<any>();
      mockServer.submitTransaction
        .mockImplementationOnce(() => first.promise)
        .mockResolvedValueOnce({ hash: 'other-wallet' });

      const p1 = service.buildAndSubmit('SECRET1', ops);
      const p2 = service.buildAndSubmit('SECRET2', ops);

      await expect(p2).resolves.toEqual({ hash: 'other-wallet' });
      expect(mockServer.loadAccount).toHaveBeenCalledWith('G_SECRET2');

      first.resolve({ hash: 'first' });
      await p1;
    });
  });
});
