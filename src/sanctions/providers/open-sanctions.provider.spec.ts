import { Test, TestingModule } from '@nestjs/testing';
import { OpenSanctionsProvider } from './open-sanctions.provider';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';

describe('OpenSanctionsProvider', () => {
  let provider: OpenSanctionsProvider;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenSanctionsProvider,
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    provider = module.get<OpenSanctionsProvider>(OpenSanctionsProvider);
    httpService = module.get<HttpService>(HttpService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('screen', () => {
    it('should return a match for a known sanctioned name', async () => {
      const response = {
        data: {
          responses: {
            q0: {
              results: [
                {
                  id: '1',
                  caption: 'Osama Bin Laden',
                  score: 0.99,
                  datasets: ['us_ofac_sdn'],
                },
              ],
            },
          },
        },
      };
      (httpService.post as jest.Mock).mockReturnValue(of(response));
      const matches = await provider.screen({ fullName: 'Osama Bin Laden' });
      expect(matches.length).toBe(1);
      expect(matches[0].score).toBe(99);
    });

    it('should return no matches for a clean name', async () => {
      const response = {
        data: {
          responses: {
            q0: {
              results: [],
            },
          },
        },
      };
      (httpService.post as jest.Mock).mockReturnValue(of(response));
      const matches = await provider.screen({ fullName: 'John Doe' });
      expect(matches.length).toBe(0);
    });

    it('should return an empty array if the API call fails', async () => {
      (httpService.post as jest.Mock).mockImplementation(() => {
        throw new Error('API Error');
      });
      const matches = await provider.screen({ fullName: 'John Doe' });
      expect(matches).toEqual([]);
    });
  });
});
