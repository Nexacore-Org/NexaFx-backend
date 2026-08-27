import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CanaryToken } from '../entities/canary-token.entity';
import { CanaryAdminController } from '../canary-admin.controller';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Reflector } from '@nestjs/core';

describe('CanaryAdminController', () => {
  let controller: CanaryAdminController;
  let canaryRepo: Repository<CanaryToken>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CanaryAdminController],
      providers: [
        {
          provide: getRepositoryToken(CanaryToken),
          useClass: Repository,
        },
        {
          provide: RolesGuard,
          useValue: {
            canActivate: jest.fn(() => true),
          },
        },
        {
          provide: Reflector,
          useValue: {
            get: jest.fn(() => ['SUPER_ADMIN']),
          },
        },
      ],
    }).compile();

    controller = module.get<CanaryAdminController>(CanaryAdminController);
    canaryRepo = module.get<Repository<CanaryToken>>(
      getRepositoryToken(CanaryToken),
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listAllCanaryTokens', () => {
    it('should return a list of canary tokens', async () => {
      const tokens = [new CanaryToken(), new CanaryToken()];
      jest.spyOn(canaryRepo, 'find').mockResolvedValue(tokens);

      const result = await controller.listAllCanaryTokens();

      expect(result).toEqual(tokens);
      expect(canaryRepo.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
      });
    });
  });
});
