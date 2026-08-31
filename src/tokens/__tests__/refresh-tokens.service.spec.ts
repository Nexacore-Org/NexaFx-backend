import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshTokensService } from '../refresh-tokens.service';
import { RefreshToken } from '../refresh-token.entity';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';

describe('RefreshTokensService', () => {
  let service: RefreshTokensService;
  let refreshTokenRepository: Repository<RefreshToken>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokensService,
        {
          provide: getRepositoryToken(RefreshToken),
          useClass: Repository,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'REFRESH_TOKEN_SECRET') return 'secret';
              if (key === 'REFRESH_TOKEN_EXPIRES_DAYS') return '30';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RefreshTokensService>(RefreshTokensService);
    refreshTokenRepository = module.get<Repository<RefreshToken>>(
      getRepositoryToken(RefreshToken),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRefreshToken', () => {
    it('should create a new refresh token', async () => {
      const userId = '1';
      const createSpy = jest
        .spyOn(refreshTokenRepository, 'create')
        .mockReturnValue({} as RefreshToken);
      const saveSpy = jest
        .spyOn(refreshTokenRepository, 'save')
        .mockResolvedValue({} as RefreshToken);

      const token = await service.createRefreshToken(userId);

      expect(token).toBeDefined();
      expect(createSpy).toHaveBeenCalled();
      expect(saveSpy).toHaveBeenCalled();
    });
  });

  describe('validateRefreshToken', () => {
    it('should throw an error for an invalid token', async () => {
      jest.spyOn(refreshTokenRepository, 'findOne').mockResolvedValue(null);
      await expect(
        service.validateRefreshToken('invalid_token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
