import { Test, TestingModule } from '@nestjs/testing';
import { OfacProvider } from './ofac.provider';
import { HttpService } from '@nestjs/axios';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OfacEntry } from '../entities/ofac-entry.entity';

describe('OfacProvider', () => {
  let provider: OfacProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfacProvider,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(OfacEntry),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            getMany: jest.fn(),
          },
        },
      ],
    }).compile();

    provider = module.get<OfacProvider>(OfacProvider);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  describe('screen', () => {
    it('should return a match for a known sanctioned name', async () => {
      const ofacRepo = (provider as any).ofacRepo;
      ofacRepo.getMany.mockResolvedValue([
        {
          id: '1',
          sdnName: 'Osama Bin Laden',
          normalizedName: 'osama bin laden',
          aliases: [],
        },
      ]);
      const matches = await provider.screen({ fullName: 'Osama Bin Laden' });
      expect(matches.length).toBe(1);
      expect(matches[0].score).toBe(100);
    });

    it('should return no matches for a clean name', async () => {
      const ofacRepo = (provider as any).ofacRepo;
      ofacRepo.getMany.mockResolvedValue([]);
      const matches = await provider.screen({ fullName: 'John Doe' });
      expect(matches.length).toBe(0);
    });
  });
});
