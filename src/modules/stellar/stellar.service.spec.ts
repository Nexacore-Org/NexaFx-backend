import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StellarService } from './stellar.service';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';

describe('StellarService', () => {
  let service: StellarService;

  const mockAuditLogsService = {
    logSystemEvent: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                NODE_ENV: 'test',
                STELLAR_NETWORK: 'TESTNET',
                STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
              };
              return values[key];
            }),
          },
        },
        { provide: AuditLogsService, useValue: mockAuditLogsService },
      ],
    }).compile();

    service = module.get(StellarService);
  });

  it('creates a Stellar keypair', () => {
    const keypair = service.createKeypair();

    expect(keypair.publicKey).toMatch(/^G/);
    expect(keypair.secretKey).toMatch(/^S/);
  });

  it('matches an inbound payment by destination, amount, asset, and memo', async () => {
    const address =
      'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
    const memo = '0123456789abcdef0123456789ab';
    const paymentPage = {
      records: [
        {
          created_at: new Date().toISOString(),
          from: address,
          to: address,
          amount: '100.0000000',
          transaction_hash: 'self-payment-hash',
          asset_type: 'native',
        },
        {
          created_at: new Date().toISOString(),
          from: 'G_SOURCE_ACCOUNT',
          to: address,
          amount: '100.0000000',
          transaction_hash: 'stellar-inbound-hash',
          asset_type: 'native',
        },
      ],
      next: jest.fn(),
    };
    const paymentBuilder = {
      forAccount: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      call: jest.fn().mockResolvedValue(paymentPage),
    };
    const transactionBuilder = {
      transaction: jest.fn().mockReturnThis(),
      call: jest.fn().mockResolvedValue({
        successful: true,
        memo_type: 'text',
        memo,
      }),
    };

    Object.defineProperty(service, 'server', {
      value: {
        payments: jest.fn(() => paymentBuilder),
        transactions: jest.fn(() => transactionBuilder),
      },
    });

    await expect(
      service.findIncomingPayment({
        address,
        amount: '100.00000000',
        currency: 'XLM',
        memo,
        createdAfter: new Date(Date.now() - 60_000),
      }),
    ).resolves.toEqual({ hash: 'stellar-inbound-hash' });
    expect(paymentBuilder.forAccount).toHaveBeenCalledWith(address);
    expect(transactionBuilder.transaction).toHaveBeenCalledWith(
      'stellar-inbound-hash',
    );
  });

  it('skips Friendbot funding in production', async () => {
    const config = service['configService'];
    jest.spyOn(config, 'get').mockImplementation((key: string) => {
      if (key === 'NODE_ENV') return 'production';
      if (key === 'STELLAR_NETWORK') return 'TESTNET';
      if (key === 'STELLAR_HORIZON_URL') {
        return 'https://horizon-testnet.stellar.org';
      }
      return undefined;
    });

    await expect(
      service.fundTestnetWallet(
        'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOUJ3UHMNGUAO7UP',
      ),
    ).resolves.toBeUndefined();
  });

  describe('getAssetWithDefaultIssuer', () => {
    const testnetIssuer =
      'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335XPB7X3NCQXMK3SBEG3CIFE7G';
    const publicIssuer =
      'GDSBCQO34HWPGUGQSP3QBFEXVTSR2PW46UIGTHVWGWJGQKH3AFNHXHXN';

    const buildService = async (
      network: string,
      issuers: Record<string, unknown>,
    ): Promise<StellarService> => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          StellarService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                const values: Record<string, unknown> = {
                  NODE_ENV: 'test',
                  STELLAR_NETWORK: network,
                  STELLAR_HORIZON_URL:
                    network === 'PUBLIC'
                      ? 'https://horizon.stellar.org'
                      : 'https://horizon-testnet.stellar.org',
                  STELLAR_ASSET_ISSUERS: issuers,
                };
                return values[key];
              }),
            },
          },
          { provide: AuditLogsService, useValue: mockAuditLogsService },
        ],
      }).compile();

      return moduleRef.get(StellarService);
    };

    it('returns the native asset for XLM without an issuer', () => {
      expect(service.getAssetWithDefaultIssuer('XLM').isNative()).toBe(true);
    });

    it('uses the issuer configured for the active network', async () => {
      const configured = await buildService('TESTNET', {
        TESTNET: { USDC: testnetIssuer },
        PUBLIC: { USDC: publicIssuer },
      });

      expect(configured.getAssetWithDefaultIssuer('USDC').getIssuer()).toBe(
        testnetIssuer,
      );

      const production = await buildService('PUBLIC', {
        TESTNET: { USDC: testnetIssuer },
        PUBLIC: { USDC: publicIssuer },
      });

      expect(production.getAssetWithDefaultIssuer('USDC').getIssuer()).toBe(
        publicIssuer,
      );
    });

    it('throws for an asset code without a configured issuer', async () => {
      const configured = await buildService('TESTNET', {
        TESTNET: { USDC: testnetIssuer },
      });

      expect(() => configured.getAssetWithDefaultIssuer('ZZZ')).toThrow(
        /No Stellar issuer configured/,
      );
    });
  });
});
