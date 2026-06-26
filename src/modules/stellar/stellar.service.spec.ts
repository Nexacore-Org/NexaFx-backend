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
});
