import { Test, TestingModule } from '@nestjs/testing';
import { HorizonService } from './horizon.service';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

describe('HorizonService', () => {
  let service: HorizonService;
  let mockAxios: MockAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HorizonService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => 'https://horizon-testnet.stellar.org'),
          },
        },
        {
          provide: 'CACHE_MANAGER',
          useValue: { get: jest.fn(), set: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<HorizonService>(HorizonService);
    mockAxios = new MockAdapter(axios);
  });

  it('should fetch account balances', async () => {
    mockAxios
      .onGet('https://horizon-testnet.stellar.org/accounts/GA...')
      .reply(200, {
        balances: [{ asset_type: 'native', balance: '1000.0000000' }],
      });

    const balances = await service.getAccountBalances('GA...');
    expect(balances).toEqual([
      { asset_type: 'native', asset_code: undefined, balance: '1000.0000000' },
    ]);
  });
});
