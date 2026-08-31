import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { NotFoundException } from '@nestjs/common';
import { RiskController } from './risk.controller';
import { RiskService, CustomerProfileInput } from './risk.service';
import {
  CustomerRiskRating,
  RiskLevel,
} from './entities/customer-risk-rating.entity';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';

describe('RiskController', () => {
  let controller: RiskController;
  let riskService: RiskService;

  const mockRiskRating: CustomerRiskRating = {
    id: 'rating-uuid-123',
    userId: 'user-uuid-456',
    score: 30,
    riskLevel: RiskLevel.MEDIUM,
    factors: { kycTierScore: 20 },
    lastEvaluatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRiskService = {
    getRiskRating: jest.fn(),
    evaluateCustomerRisk: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RiskController],
      providers: [
        {
          provide: RiskService,
          useValue: mockRiskService,
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<RiskController>(RiskController);
    riskService = module.get<RiskService>(RiskService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('Access Control & Decorators', () => {
    it('should have ADMIN and SUPER_ADMIN roles configured on the controller', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, RiskController);
      expect(roles).toBeDefined();
      expect(roles).toContain(UserRole.ADMIN);
      expect(roles).toContain(UserRole.SUPER_ADMIN);
      expect(roles).not.toContain(UserRole.USER);
    });
  });

  describe('getCustomerRisk', () => {
    it('should return risk rating data when rating exists', async () => {
      mockRiskService.getRiskRating.mockResolvedValue(mockRiskRating);

      const result = await controller.getCustomerRisk('user-uuid-456');

      expect(result).toEqual(mockRiskRating);
      expect(mockRiskService.getRiskRating).toHaveBeenCalledWith('user-uuid-456');
    });

    it('should throw NotFoundException if no rating found for customer', async () => {
      mockRiskService.getRiskRating.mockResolvedValue(null);

      await expect(controller.getCustomerRisk('non-existent-user')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRiskService.getRiskRating).toHaveBeenCalledWith('non-existent-user');
    });
  });

  describe('evaluateCustomerRisk', () => {
    it('should delegate evaluation to riskService with provided input', async () => {
      const input: CustomerProfileInput = {
        totalVolumeUsd30d: '5000',
        transactionCount30d: 10,
      };
      mockRiskService.evaluateCustomerRisk.mockResolvedValue(mockRiskRating);

      const result = await controller.evaluateCustomerRisk('user-uuid-456', input);

      expect(result).toEqual(mockRiskRating);
      expect(mockRiskService.evaluateCustomerRisk).toHaveBeenCalledWith(
        'user-uuid-456',
        input,
      );
    });
  });
});
