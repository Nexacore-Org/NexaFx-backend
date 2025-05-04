// src/referrals/tests/referrals.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReferralsService } from '../referrals.service';
import { Referral } from '../entities/referral.entity';
import { CreateReferralDto } from '../dto/create-referral.dto';
import { UseReferralDto } from '../dto/use-referral.dto';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('ReferralsService', () => {
  let service: ReferralsService;
  let repository: Repository<Referral>;

  const mockRepository = () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralsService,
        {
          provide: getRepositoryToken(Referral),
          useFactory: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ReferralsService>(ReferralsService);
    repository = module.get<Repository<Referral>>(getRepositoryToken(Referral));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateReferralCode', () => {
    it('should generate a new referral code', async () => {
      const dto: CreateReferralDto = { referrerUserId: 'user-123' };
      const savedReferral = { id: 'ref-1', code: 'abc123', referrerUserId: 'user-123', createdAt: new Date() };
      
      jest.spyOn(repository, 'save').mockResolvedValue(savedReferral as Referral);
      
      const result = await service.generateReferralCode(dto);
      expect(result).toEqual(savedReferral);
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('useReferralCode', () => {
    it('should successfully use a valid referral code', async () => {
      const dto: UseReferralDto = { code: 'abc123', referredUserId: 'user-456' };
      const existingReferral = null;
      const validReferral = {
        id: 'ref-1',
        code: 'abc123',
        referrerUserId: 'user-123',
        active: true,
      };
      const updatedReferral = {
        ...validReferral,
        referredUserId: 'user-456',
        usedAt: expect.any(Date),
        active: false,
      };
      
      jest.spyOn(repository, 'findOne')
        .mockResolvedValueOnce(existingReferral)
        .mockResolvedValueOnce(validReferral as Referral);
      
      jest.spyOn(repository, 'save').mockResolvedValue(updatedReferral as Referral);
      
      const result = await service.useReferralCode(dto);
      expect(result).toEqual(updatedReferral);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if user was already referred', async () => {
      const dto: UseReferralDto = { code: 'abc123', referredUserId: 'user-456' };
      const existingReferral = { id: 'ref-2' };
      
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(existingReferral as Referral);
      
      await expect(service.useReferralCode(dto)).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if referral code does not exist', async () => {
      const dto: UseReferralDto = { code: 'invalid', referredUserId: 'user-456' };
      
      jest.spyOn(repository, 'findOne')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      
      await expect(service.useReferralCode(dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if user tries to refer themselves', async () => {
      const dto: UseReferralDto = { code: 'abc123', referredUserId: 'user-123' };
      const existingReferral = null;
      const validReferral = {
        id: 'ref-1',
        code: 'abc123',
        referrerUserId: 'user-123',
        active: true,
      };
      
      jest.spyOn(repository, 'findOne')
        .mockResolvedValueOnce(existingReferral)
        .mockResolvedValueOnce(validReferral as Referral);
      
      await expect(service.useReferralCode(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getReferralsByUser', () => {
    it('should return all referrals made by a user', async () => {
      const userId = 'user-123';
      const referrals = [
        { id: 'ref-1', referrerUserId: userId },
        { id: 'ref-2', referrerUserId: userId },
      ];
      
      jest.spyOn(repository, 'find').mockResolvedValue(referrals as Referral[]);
      
      const result = await service.getReferralsByUser(userId);
      expect(result).toEqual(referrals);
      expect(repository.find).toHaveBeenCalledWith({ where: { referrerUserId: userId } });
    });
  });
});