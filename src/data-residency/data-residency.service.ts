// src/data-residency/data-residency.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { DataResidencyPolicy, DataRegion } from './entities/data-residency-policy.entity';
import { SetDataResidencyPolicyDto } from './dto/set-policy.dto';

@Injectable()
export class DataResidencyService {
  constructor(
    @InjectRepository(DataResidencyPolicy)
    private readonly policyRepository: Repository<DataResidencyPolicy>,
    private readonly configService: ConfigService,
  ) {}

  async setPolicy(dto: SetDataResidencyPolicyDto, adminId: string): Promise<DataResidencyPolicy> {
    let policy = await this.policyRepository.findOne({ where: { userId: dto.userId } });

    if (policy) {
      policy.requiredRegion = dto.requiredRegion;
      policy.setByAdminId = adminId;
    } else {
      policy = this.policyRepository.create({
        userId: dto.userId,
        requiredRegion: dto.requiredRegion,
        setByAdminId: adminId,
      });
    }

    return this.policyRepository.save(policy);
  }

  async getAuditConflicts(): Promise<{
    currentSystemRegion: string;
    conflicts: DataResidencyPolicy[];
  }> {
    // Single config-driven storage region today (defaults to US if not set)
    const currentSystemRegion = this.configService.get<string>('STORAGE_REGION', DataRegion.US);

    // Find users whose required region is stricter than the current single-region storage setup
    // e.g. required is EU, but system storage region is US.
    const allPolicies = await this.policyRepository.find();
    const conflicts = allPolicies.filter(
      (policy) => policy.requiredRegion !== DataRegion.UNRESTRICTED && policy.requiredRegion !== currentSystemRegion,
    );

    return {
      currentSystemRegion,
      conflicts,
    };
  }
}