import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Beneficiary } from './entities/beneficiary.entity';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';

@Injectable()
export class BeneficiariesService {
  constructor(
    @InjectRepository(Beneficiary)
    private readonly beneficiaryRepository: Repository<Beneficiary>,
  ) {}

  async createBeneficiary(
    userId: string,
    dto: CreateBeneficiaryDto,
  ): Promise<Beneficiary> {
    // If this is set as default, unset all other defaults first
    if (dto.isDefault) {
      await this.beneficiaryRepository.update(
        { userId, isDefault: true },
        { isDefault: false },
      );
    }

    const beneficiary = this.beneficiaryRepository.create({
      ...dto,
      userId,
    });

    return this.beneficiaryRepository.save(beneficiary);
  }

  async getUserBeneficiaries(userId: string): Promise<Beneficiary[]> {
    return this.beneficiaryRepository.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });
  }

  async getBeneficiaryById(userId: string, id: string): Promise<Beneficiary> {
    const beneficiary = await this.beneficiaryRepository.findOne({
      where: { id },
    });

    if (!beneficiary) {
      throw new NotFoundException(`Beneficiary with ID "${id}" not found`);
    }

    if (beneficiary.userId !== userId) {
      throw new ForbiddenException(
        'You do not have access to this beneficiary',
      );
    }

    return beneficiary;
  }

  async updateBeneficiary(
    userId: string,
    id: string,
    dto: UpdateBeneficiaryDto,
  ): Promise<Beneficiary> {
    const beneficiary = await this.getBeneficiaryById(userId, id);

    Object.assign(beneficiary, dto);
    return this.beneficiaryRepository.save(beneficiary);
  }

  async deleteBeneficiary(userId: string, id: string): Promise<void> {
    const beneficiary = await this.getBeneficiaryById(userId, id);
    await this.beneficiaryRepository.remove(beneficiary);
  }

  async setDefault(userId: string, id: string): Promise<Beneficiary> {
    // Validate the beneficiary belongs to this user
    const beneficiary = await this.getBeneficiaryById(userId, id);

    // Unset all current defaults for this user
    await this.beneficiaryRepository.update(
      { userId, isDefault: true },
      { isDefault: false },
    );

    // Set new default
    beneficiary.isDefault = true;
    return this.beneficiaryRepository.save(beneficiary);
  }

  /**
   * Used by the withdrawal flow — fetch wallet address from a saved beneficiary.
   */
  async resolveWalletAddress(
    userId: string,
    beneficiaryId: string,
  ): Promise<string> {
    const beneficiary = await this.getBeneficiaryById(userId, beneficiaryId);
    return beneficiary.walletAddress;
  }
}
