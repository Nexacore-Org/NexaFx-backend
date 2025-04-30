import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Referral } from './entities/referral.entity';
import { CreateReferralDto } from './dto/create-referral.dto';
import { UseReferralDto } from './dto/use-referral.dto';

@Injectable()
export class ReferralsService {
  constructor(
    @InjectRepository(Referral)
    private referralsRepository: Repository<Referral>,
  ) {}

  /**
   * Generate a new referral code for a user
   */
  async generateReferralCode(createReferralDto: CreateReferralDto): Promise<Referral> {
    const code = uuidv4().substring(0, 8); // Generate a shorter UUID for better user experience
    
    const referral = new Referral();
    referral.referrerUserId = createReferralDto.referrerUserId;
    referral.code = code;
    
    return this.referralsRepository.save(referral);
  }

  /**
   * Use a referral code
   */
  async useReferralCode(useReferralDto: UseReferralDto): Promise<Referral> {
    const { code, referredUserId } = useReferralDto;
    
    // Check if user has already been referred
    const existingReferral = await this.referralsRepository.findOne({
      where: { referredUserId }
    });
    
    if (existingReferral) {
      throw new ConflictException('User has already been referred');
    }
    
    // Find valid referral code
    const referral = await this.referralsRepository.findOne({
      where: { code, active: true }
    });
    
    if (!referral) {
      throw new NotFoundException('Referral code not found or already used');
    }
    
    // Prevent self-referrals
    if (referral.referrerUserId === referredUserId) {
      throw new BadRequestException('Users cannot refer themselves');
    }
    
    // Update referral with referred user
    referral.referredUserId = referredUserId;
    referral.usedAt = new Date();
    referral.active = false;
    
    return this.referralsRepository.save(referral);
  }

  /**
   * Get all referrals made by a user
   */
  async getReferralsByUser(userId: string): Promise<Referral[]> {
    return this.referralsRepository.find({
      where: { referrerUserId: userId }
    });
  }

  /**
   * Get referral info for a specific code
   */
  async getReferralByCode(code: string): Promise<Referral> {
    const referral = await this.referralsRepository.findOne({
      where: { code }
    });
    
    if (!referral) {
      throw new NotFoundException('Referral code not found');
    }
    
    return referral;
  }

  /**
   * Check if a referral code is valid
   */
  async isValidReferralCode(code: string): Promise<boolean> {
    const referral = await this.referralsRepository.findOne({
      where: { code, active: true }
    });
    
    return !!referral;
  }
}