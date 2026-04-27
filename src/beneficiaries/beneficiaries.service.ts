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

  async updateLastUsed(id: string): Promise<void> {
    await this.beneficiaryRepository.update(id, { lastUsedAt: new Date() });
  }

  async updateBeneficiary(
    userId: string,
    id: string,
    dto: UpdateBeneficiaryDto,
  ): Promise<Beneficiary> {
    await this.getBeneficiaryById(userId, id);

    if (dto.isDefault) {
      await this.beneficiaryRepository.update(
        { userId, isDefault: true },
        { isDefault: false },
      );
    }

    await this.beneficiaryRepository.update({ id, userId }, dto);
    return this.getBeneficiaryById(userId, id);
  }

  async deleteBeneficiary(userId: string, id: string): Promise<void> {
    await this.getBeneficiaryById(userId, id);
    await this.beneficiaryRepository.delete({ id, userId });
  }

  async setDefault(userId: string, id: string): Promise<Beneficiary> {
    await this.getBeneficiaryById(userId, id);

    await this.beneficiaryRepository.update(
      { userId, isDefault: true },
      { isDefault: false },
    );

    await this.beneficiaryRepository.update(
      { id, userId },
      { isDefault: true },
    );
    return this.getBeneficiaryById(userId, id);
  }
}
